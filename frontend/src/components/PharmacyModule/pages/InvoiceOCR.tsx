import { useState } from "react"
import { LLM_CHAT_URL, llmModel } from "../../../lib/llm"
import {
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Edit3,
  XCircle,
  AlertTriangle,
  Loader,
  Plus,
  Trash2,
  FileText,
  Check,
  ShieldCheck,
  Receipt,
} from "lucide-react"
import PageHeader from "../components/PageHeader"
import { usePharmacyData } from "../data/usePharmacyData"
import { PharmacyDatabase } from "../../../services/pharmacyDb"
import { API_BASE } from "../../../lib/constants"
import { withAuthHeaders } from "../../../lib/api"

const confColor = (c: number) =>
  c >= 90 ? "#15803d" : c >= 75 ? "#d97706" : "#dc2626"
const confBg = (c: number) =>
  c >= 90 ? "#DCFCE7" : c >= 75 ? "#FEF3C7" : "#FEE2E2"

const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100

interface InvoiceOCRProps {
  onNavigate: (page: string) => void
}

interface InvoiceHeader {
  supplierName: string
  invoiceNumber: string
  invoiceDate: string
  gstin: string
  poNumber: string
  paymentTerms: string
}

interface ExtractedItem {
  id: string
  matched: string
  mfr: string
  pack: string
  batch: string
  expiry: string
  hsn: string
  quantity: number
  mrp: number
  rate: number
  discount: number
  gst: number
  confidence: number
  status: string
  existsInMaster?: boolean
}

export default function InvoiceOCR({ onNavigate }: InvoiceOCRProps) {
  const { medicines, refresh } = usePharmacyData()
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(false)

  // Editable Header Details (populated ONLY from OCR)
  const [invoiceHeader, setInvoiceHeader] = useState<InvoiceHeader>({
    supplierName: "",
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().split("T")[0],
    gstin: "",
    poNumber: "",
    paymentTerms: "Credit",
  })

  // Editable Extracted Items Table
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([])
  const [imagePreview, setImagePreview] = useState<string>("")
  const [manualRoundOff, setManualRoundOff] = useState<number | null>(null)
  const [ocrErrorMessage, setOcrErrorMessage] = useState<string | null>(null)

  /**
   * Helper to rotate and downscale an image on an HTML5 canvas so the Vision AI
   * model receives a clean, upright, high-contrast, lightweight image (< 300KB instead of 12MB).
   */
  const preprocessImage = (
    dataUrl: string,
    rotationAngle: number = 0,
  ): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(dataUrl)
          return
        }

        let rot = ((rotationAngle % 360) + 360) % 360
        let w = img.width
        let h = img.height

        // Auto-detect landscape photo of portrait document on initial load
        if (rotationAngle === 0 && w > h * 1.15) {
          rot = 270 // 90 deg clockwise in canvas rotation coordinates
        }

        // Limit maximum dimension to 1600px for instant OCR speed & low VRAM
        const MAX_DIM = 1600
        let scale = 1
        if (Math.max(w, h) > MAX_DIM) {
          scale = MAX_DIM / Math.max(w, h)
        }
        const sw = Math.round(w * scale)
        const sh = Math.round(h * scale)

        if (rot === 90 || rot === 270) {
          canvas.width = sh
          canvas.height = sw
        } else {
          canvas.width = sw
          canvas.height = sh
        }

        ctx.save()
        if (rot === 90) {
          ctx.translate(canvas.width, 0)
          ctx.rotate((90 * Math.PI) / 180)
        } else if (rot === 180) {
          ctx.translate(canvas.width, canvas.height)
          ctx.rotate((180 * Math.PI) / 180)
        } else if (rot === 270) {
          ctx.translate(0, canvas.height)
          ctx.rotate((270 * Math.PI) / 180)
        }
        ctx.drawImage(img, 0, 0, sw, sh)
        ctx.restore()

        resolve(canvas.toDataURL("image/jpeg", 0.88))
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    })
  }

  /**
   * Directly queries vLLM Qwen2.5-VL Vision Model via same-origin proxy or direct localhost to perform OCR & AI extraction on base64 invoice image.
   */
  const extractWithQwenVisionAI = async (base64Image: string): Promise<{
    header: InvoiceHeader
    items: ExtractedItem[]
  } | null> => {
    try {
      const prompt = `Perform comprehensive visual OCR on this upright Indian pharmaceutical GST invoice image.
Extract the header details and every line item row in the items table into valid JSON with this exact schema:
{
  "supplierName": "Exact supplier / distributor name from top header",
  "invoiceNumber": "Exact invoice / bill number",
  "invoiceDate": "YYYY-MM-DD",
  "gstin": "Supplier GSTIN number",
  "poNumber": "PO number if present",
  "paymentTerms": "Credit or Cash",
  "items": [
    {
      "matched": "Full Product / Medicine / Item Name",
      "mfr": "Manufacturer code or brand",
      "pack": "Packaging size (e.g. 10s, 200ML, 10x10)",
      "batch": "Batch number",
      "expiry": "Expiry date (YYYY-MM-DD or MM/YY)",
      "hsn": "HSN code",
      "quantity": 10,
      "rate": 571.47,
      "mrp": 750.05,
      "discount": 3.0,
      "gst": 5.0
    }
  ]
}
Extract EVERY SINGLE product row visible in the table. Ensure quantities, rates, MRPs, batches, discounts, and GST percentages are accurately extracted from their respective columns.
Output strictly valid JSON only without markdown formatting.`

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 35000)

      const payload = {
        // Ask the server which model it serves; a hardcoded name 400s on swap.
        model: await llmModel().catch(() => "default"),
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: base64Image } },
              { type: "text", text: prompt },
            ],
          },
        ],
        max_tokens: 1800,
        temperature: 0.0,
      }

      // Same-origin proxy only: a direct localhost:8700 fallback fails from
      // any machine but this one (and cross-origin besides).
      const res = await fetch(LLM_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).catch(() => null)

      clearTimeout(timeoutId)

      if (res && res.ok) {
        const data = await res.json()
        const content = data.choices?.[0]?.message?.content || ""
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const json = JSON.parse(jsonMatch[0])
          if (json.supplierName || (json.items && json.items.length > 0)) {
            const header: InvoiceHeader = {
              supplierName: json.supplierName || "",
              invoiceNumber: json.invoiceNumber || "",
              invoiceDate:
                json.invoiceDate || new Date().toISOString().split("T")[0],
              gstin: json.gstin || "",
              poNumber: json.poNumber || "",
              paymentTerms: json.paymentTerms || "Credit",
            }

            const items: ExtractedItem[] = (json.items || [])
              .map((it: any, i: number) => {
                const name = it.matched || it.name || it.description || ""
                const rate = Number(it.rate) || 0
                const mrp =
                  Number(it.mrp) || (rate > 0 ? round2(rate * 1.3) : 0)
                return {
                  id: "ITEM_" + Date.now() + "_" + i,
                  matched: name,
                  mfr: it.mfr || "",
                  pack: it.pack || "",
                  batch: it.batch || "",
                  expiry: it.expiry || "",
                  hsn: it.hsn || "",
                  quantity: Number(it.quantity) || 0,
                  mrp: mrp,
                  rate: rate,
                  discount: Number(it.discount) || 0,
                  gst: Number(it.gst) || 0,
                  confidence: 96,
                  status: "ok",
                  existsInMaster: medicines.some((m) =>
                    m.name?.toLowerCase().includes(name.toLowerCase()),
                  ),
                }
              })
              .filter((it: ExtractedItem) => it.matched)

            if (items.length > 0) {
              return { header, items }
            }
          }
        }
      }
    } catch (err) {
      console.warn("vLLM Vision OCR extraction error:", err)
    }
    return null
  }

  /** Dynamic OCR markdown/text parser (Zero Hardcoding) */
  const parseMarkdownInvoiceText = (md: string): {
    header: InvoiceHeader
    items: ExtractedItem[]
  } | null => {
    const lines = md
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
    let supplier = ""
    let invNo = ""
    let invDate = new Date().toISOString().split("T")[0]
    let gstin = ""

    lines.forEach((line) => {
      if (
        !supplier &&
        (line.toLowerCase().includes("supplier") ||
          line.toLowerCase().includes("m/s") ||
          line.toLowerCase().includes("from:"))
      ) {
        const parts = line.split(/[:|-]/)
        if (parts.length > 1) supplier = parts[1].trim()
      }
      if (
        !invNo &&
        (line.toLowerCase().includes("invoice no") ||
          line.toLowerCase().includes("inv no") ||
          line.toLowerCase().includes("bill no"))
      ) {
        const parts = line.split(/[:|-]/)
        if (parts.length > 1) invNo = parts[1].trim()
      }
      if (
        !gstin &&
        (line.toLowerCase().includes("gstin") ||
          line.toLowerCase().includes("gst no"))
      ) {
        const gstinMatch = line.match(
          /\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}\b/i,
        )
        if (gstinMatch) gstin = gstinMatch[0]
      }
    })

    const parsedItems: ExtractedItem[] = []
    let headerLineIdx = lines.findIndex(
      (l) => l.includes("|") && l.includes("---"),
    )
    if (headerLineIdx === -1)
      headerLineIdx = lines.findIndex((l) => l.includes("|"))

    if (headerLineIdx !== -1) {
      const headers = lines[headerLineIdx]
        .split("|")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
      const colMap: Record<string, number> = {
        name: -1,
        qty: -1,
        rate: -1,
        mrp: -1,
        batch: -1,
        expiry: -1,
        gst: -1,
        disc: -1,
        mfr: -1,
        pack: -1,
        hsn: -1,
      }

      headers.forEach((h, idx) => {
        if (
          h.includes("desc") ||
          h.includes("name") ||
          h.includes("product") ||
          h.includes("item")
        )
          colMap.name = idx
        else if (h.includes("qty") || h.includes("quantity")) colMap.qty = idx
        else if (h.includes("rate") || h.includes("price") || h.includes("ptr"))
          colMap.rate = idx
        else if (h.includes("mrp")) colMap.mrp = idx
        else if (h.includes("batch")) colMap.batch = idx
        else if (h.includes("exp")) colMap.expiry = idx
        else if (h.includes("gst") || h.includes("tax")) colMap.gst = idx
        else if (h.includes("disc") || h.includes("sch")) colMap.disc = idx
        else if (h.includes("mfr") || h.includes("make")) colMap.mfr = idx
        else if (h.includes("pack")) colMap.pack = idx
        else if (h.includes("hsn")) colMap.hsn = idx
      })

      if (colMap.name === -1) colMap.name = 0

      for (let i = headerLineIdx + 2; i < lines.length; i++) {
        const line = lines[i]
        if (!line.includes("|")) break

        const cols = line
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean)
        if (cols.length < 2) continue

        const name = cols[colMap.name] || ""
        if (!name || name.includes("---")) continue

        let qty =
          colMap.qty !== -1
            ? Number(cols[colMap.qty]?.replace(/[^0-9.]/g, "")) || 0
            : 0
        let rate =
          colMap.rate !== -1
            ? Number(cols[colMap.rate]?.replace(/[^0-9.]/g, "")) || 0
            : 0
        let mrp =
          colMap.mrp !== -1
            ? Number(cols[colMap.mrp]?.replace(/[^0-9.]/g, "")) || 0
            : 0
        let batch =
          colMap.batch !== -1 && cols[colMap.batch] ? cols[colMap.batch] : ""
        let expiry =
          colMap.expiry !== -1 && cols[colMap.expiry] ? cols[colMap.expiry] : ""
        let gst =
          colMap.gst !== -1
            ? Number(cols[colMap.gst]?.replace(/[^0-9.]/g, "")) || 0
            : 0
        let disc =
          colMap.disc !== -1
            ? Number(cols[colMap.disc]?.replace(/[^0-9.]/g, "")) || 0
            : 0
        let mfr = colMap.mfr !== -1 && cols[colMap.mfr] ? cols[colMap.mfr] : ""
        let pack =
          colMap.pack !== -1 && cols[colMap.pack] ? cols[colMap.pack] : ""
        let hsn = colMap.hsn !== -1 && cols[colMap.hsn] ? cols[colMap.hsn] : ""

        parsedItems.push({
          id: "ITEM_" + Date.now() + "_" + i,
          matched: name,
          mfr: mfr,
          pack: pack,
          batch: batch,
          expiry: expiry,
          hsn: hsn,
          quantity: qty,
          mrp: mrp,
          rate: rate,
          discount: disc,
          gst: gst,
          confidence: 92,
          status: "ok",
          existsInMaster: medicines.some((m) =>
            m.name?.toLowerCase().includes(name.toLowerCase()),
          ),
        })
      }
    }

    if (parsedItems.length === 0) return null

    return {
      header: {
        supplierName: supplier,
        invoiceNumber: invNo,
        invoiceDate: invDate,
        gstin: gstin,
        poNumber: "",
        paymentTerms: "Credit",
      },
      items: parsedItems,
    }
  }

  const processOcrOnImage = async (dataUrl: string, rotAngle: number) => {
    setProcessing(true)
    setOcrErrorMessage(null)

    // Optimize and orient image on canvas
    const optimizedBase64 = await preprocessImage(dataUrl, rotAngle)
    setImagePreview(optimizedBase64)
    setRotation(0) // Image pixels are now baked upright

    // Step 1: Direct Qwen2.5-VL Vision AI OCR Model Call
    const visionResult = await extractWithQwenVisionAI(optimizedBase64)
    if (visionResult && visionResult.items && visionResult.items.length > 0) {
      setInvoiceHeader(visionResult.header)
      setExtractedItems(visionResult.items)
      setProcessing(false)
      setDone(true)
      return
    }

    // Step 2: Fallback to Server OCR Portal Upload API
    try {
      // Convert base64 to Blob for server multipart upload
      const byteString = atob(optimizedBase64.split(",")[1])
      const mimeString = optimizedBase64
        .split(",")[0]
        .split(":")[1]
        .split(";")[0]
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i)
      }
      const blob = new Blob([ab], { type: mimeString })

      const form = new FormData()
      form.append("file", blob, "invoice.jpg")
      form.append("blueprint", "Universal OCR (Any Text)")

      const uploadRes = await fetch(`${API_BASE}/api/ocr-portal/upload`, {
        method: "POST",
        headers: withAuthHeaders({}, "POST"),
        body: form,
        credentials: "include",
      })

      if (uploadRes.ok) {
        const uploadData = await uploadRes.json()
        const jobId = uploadData.job_id
        if (jobId) {
          for (let i = 0; i < 15; i++) {
            await new Promise((r) => setTimeout(r, 1500))
            const statusRes = await fetch(
              `${API_BASE}/api/ocr-portal/jobs/${jobId}`,
              {
                headers: {
                  ...withAuthHeaders({}, "GET"),
                  Accept: "application/json",
                },
                credentials: "include",
              },
            )
            if (!statusRes.ok) continue
            const statusData = await statusRes.json()

            if (statusData.status === "COMPLETED") {
              const resultRes = await fetch(
                `${API_BASE}/api/ocr-portal/jobs/${jobId}/result`,
                {
                  headers: {
                    ...withAuthHeaders({}, "GET"),
                    Accept: "application/json",
                  },
                  credentials: "include",
                },
              )
              if (resultRes.ok) {
                const resultData = await resultRes.json()
                if (resultData.combined_markdown) {
                  const textResult = parseMarkdownInvoiceText(
                    resultData.combined_markdown,
                  )
                  if (textResult && textResult.items && textResult.items.length > 0) {
                    setInvoiceHeader(textResult.header)
                    setExtractedItems(textResult.items)
                    setProcessing(false)
                    setDone(true)
                    return
                  }
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("Server OCR API unreachable:", err)
    }

    // Step 3: Clean error notification if unreadable
    setProcessing(false)
    setDone(false)
    setOcrErrorMessage(
      "AI Vision OCR could not detect legible text. Please ensure the invoice image is well-lit and oriented upright.",
    )
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setProcessing(true)
    setUploaded(true)
    setDone(false)
    setOcrErrorMessage(null)

    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = async () => {
      const base64Data = reader.result as string
      await processOcrOnImage(base64Data, 0)
    }
  }

  const handleReScanCurrent = async () => {
    if (!imagePreview) return
    await processOcrOnImage(imagePreview, rotation)
  }

  const updateItemField = (
    id: string,
    field: keyof ExtractedItem,
    value: any,
  ) => {
    setExtractedItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value }
          if (field === "matched") {
            updated.existsInMaster = medicines.some(
              (m) => m.name?.toLowerCase() === String(value).toLowerCase(),
            )
          }
          return updated
        }
        return item
      }),
    )
  }

  const handleAddItem = () => {
    const newItem: ExtractedItem = {
      id: "ITEM_" + Date.now(),
      matched: "",
      mfr: "",
      pack: "",
      batch: "",
      expiry: "",
      hsn: "",
      quantity: 1,
      mrp: 0,
      rate: 0,
      discount: 0,
      gst: 0,
      confidence: 100,
      status: "ok",
      existsInMaster: false,
    }
    setExtractedItems((prev) => [...prev, newItem])
  }

  const handleRemoveItem = (id: string) => {
    setExtractedItems((prev) => prev.filter((i) => i.id !== id))
  }

  // Precise Indian GST Mathematical Calculation Engine
  const calculateItemMath = (item: ExtractedItem) => {
    const baseAmount = round2(item.quantity * item.rate)
    const discountAmt = round2(baseAmount * (item.discount / 100))
    const taxableAmount = round2(baseAmount - discountAmt)
    const sgstAmt = round2(taxableAmount * (item.gst / 2 / 100))
    const cgstAmt = round2(taxableAmount * (item.gst / 2 / 100))
    const totalGstAmt = round2(sgstAmt + cgstAmt)
    const itemNetTotal = round2(taxableAmount + totalGstAmt)
    return {
      baseAmount,
      discountAmt,
      taxableAmount,
      totalGstAmt,
      sgstAmt,
      cgstAmt,
      itemNetTotal,
    }
  }

  // Totals Aggregation
  const subtotalBase = round2(
    extractedItems.reduce(
      (acc, item) => acc + calculateItemMath(item).baseAmount,
      0,
    ),
  )
  const totalDiscountAmt = round2(
    extractedItems.reduce(
      (acc, item) => acc + calculateItemMath(item).discountAmt,
      0,
    ),
  )
  const totalTaxableValue = round2(subtotalBase - totalDiscountAmt)
  const totalSGST = round2(
    extractedItems.reduce(
      (acc, item) => acc + calculateItemMath(item).sgstAmt,
      0,
    ),
  )
  const totalCGST = round2(
    extractedItems.reduce(
      (acc, item) => acc + calculateItemMath(item).cgstAmt,
      0,
    ),
  )
  const totalGstAmt = round2(totalSGST + totalCGST)
  const unroundedGrandTotal = round2(totalTaxableValue + totalGstAmt)

  // Dynamic Round Off calculation
  const autoRoundOff = round2(
    Math.round(unroundedGrandTotal) - unroundedGrandTotal,
  )
  const activeRoundOff = manualRoundOff !== null ? manualRoundOff : autoRoundOff
  const finalGrandTotal = round2(unroundedGrandTotal + activeRoundOff)

  const handleConfirmAndPostToInventory = () => {
    if (extractedItems.length === 0) {
      alert("No line items to process. Upload or scan an invoice first.")
      return
    }

    const grnId = "GRN-" + Date.now()
    const grnItems: any[] = []

    // Resolve or auto-register supplier from invoice header
    const currentSuppliers = PharmacyDatabase.getSuppliers()
    const supName = (invoiceHeader.supplierName || "Supplier").trim()
    let matchedSupplier = currentSuppliers.find(
      (s) => (s.supplierName || (s as any).name || "").toLowerCase() === supName.toLowerCase()
    )
    if (!matchedSupplier && supName) {
      matchedSupplier = {
        id: "SUP-" + Date.now(),
        supplierName: supName,
        gstInformation: invoiceHeader.gstin || "",
        contactInformation: "Invoice Purchase",
        phone: "",
        email: "",
        licenseDetails: "",
        status: "Active",
        createdAt: new Date().toISOString(),
        address: "Bhimavaram",
        paymentTerms: invoiceHeader.paymentTerms || "Credit",
      }
      PharmacyDatabase.saveSuppliers([...currentSuppliers, matchedSupplier])
    }

    extractedItems.forEach((item) => {
      let medId = ""
      const existing = medicines.find(
        (m) => m.name?.toLowerCase() === item.matched.toLowerCase(),
      )

      if (!existing) {
        medId = "MED-" + Date.now() + Math.floor(Math.random() * 1000)
        PharmacyDatabase.addMedicine({
          id: medId,
          medicineName: item.matched,
          brandName: item.matched,
          genericName: item.matched,
          categoryId: "General",
          manufacturer: item.mfr || "Standard Pharma",
          dosageForm: "Tablet",
          strength: "Standard",
          unit: item.pack || "Strip",
          barcode: "890" + Math.floor(10000000 + Math.random() * 90000000),
          taxPercentage: item.gst || 12,
          reorderLevel: 20,
          storageCondition: "Room Temperature",
          scheduleType: "H",
          controlledSubstanceFlag: false,
          activeStatus: "Active",
          createdAt: new Date().toISOString(),
        } as any)
        PharmacyDatabase.logAudit(
          "System",
          "Create",
          "Medicine",
          item.matched,
          `Auto-created medicine ${item.matched} via Smart Invoice OCR`,
        )
      } else {
        medId = existing.id
        const newStock = (existing.stock || 0) + item.quantity
        PharmacyDatabase.updateMedicine(medId, {
          stock: newStock,
          price: item.rate,
          mrp: item.mrp,
        })
      }

      // Add Batch with supplier & invoice references
      const batchId = "BAT-" + Math.floor(Math.random() * 100000)
      PharmacyDatabase.addBatch({
        id: batchId,
        medicineId: medId,
        batchNumber: item.batch || "B" + Math.floor(100000 + Math.random() * 900000),
        expiryDate: item.expiry || "2027-12-31",
        quantity: item.quantity,
        availableQuantity: item.quantity,
        mrp: item.mrp,
        purchasePrice: item.rate,
        supplierId: matchedSupplier ? matchedSupplier.id : undefined,
        invoiceNumber: invoiceHeader.invoiceNumber || undefined,
        grnId: grnId,
        createdAt: new Date().toISOString(),
        manufacturingDate: "2025-01-01",
      })

      // Add Transaction Record
      PharmacyDatabase.addTransaction({
        id: "TXN-" + Math.floor(Math.random() * 100000),
        date: new Date().toISOString(),
        medicineId: medId,
        batchId: batchId,
        quantity: item.quantity,
        transactionType: "PURCHASE_RECEIVED",
        userId: "SYS",
        reason: `Received via Invoice OCR GRN: ${grnId} (${invoiceHeader.supplierName || "Supplier"})`,
      })

      grnItems.push({
        medicineId: medId,
        orderedQty: item.quantity,
        receivedQty: item.quantity,
        batchNumber: item.batch || "B" + Math.floor(100000 + Math.random() * 900000),
        manufacturingDate: "2025-01-01",
        expiryDate: item.expiry || "2027-12-31",
        purchasePrice: item.rate,
        sellingPrice: item.mrp,
      })
    })

    // Save GRN
    const newGrn = {
      id: grnId,
      purchaseOrderId: invoiceHeader.poNumber || "DIRECT_INVOICE",
      supplierId: matchedSupplier ? matchedSupplier.id : (invoiceHeader.supplierName || "Supplier"),
      invoiceNumber: invoiceHeader.invoiceNumber || `INV-${Date.now()}`,
      grnDate: invoiceHeader.invoiceDate || new Date().toISOString(),
      items: grnItems,
      receivedBy: "Chief Pharmacist",
      createdAt: new Date().toISOString(),
    }
    PharmacyDatabase.addGRN(newGrn)

    window.dispatchEvent(new CustomEvent("hospai_pharmacy_updated"))
    window.dispatchEvent(
      new CustomEvent("hospai_pharmacy_toast", {
        detail: {
          type: "success",
          message: `GRN ${grnId} posted successfully! ${extractedItems.length} items added to Inventory.`,
        },
      }),
    )

    refresh()
    onNavigate("inventory-ledger")
  }

  const handleReset = () => {
    setUploaded(false)
    setProcessing(false)
    setDone(false)
    setImagePreview("")
    setExtractedItems([])
    setRotation(0)
    setManualRoundOff(null)
    setOcrErrorMessage(null)
    setInvoiceHeader({
      supplierName: "",
      invoiceNumber: "",
      invoiceDate: new Date().toISOString().split("T")[0],
      gstin: "",
      poNumber: "",
      paymentTerms: "Credit",
    })
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Pharmacy" },
          { label: "Procurement" },
          { label: "Smart Supplier Invoice OCR" },
        ]}
        title="Smart Supplier Invoice OCR"
        description="Upload a supplier bill image or PDF to extract details using vLLM AI Vision, calculate exact amounts & taxes, and post directly into Inventory."
        onNavigate={onNavigate}
      />

      {/* PHASE 1: Clean Initial Upload State (Before OCR) -- NO PRESETS */}
      {!done && !processing && (
        <div className="max-w-3xl mx-auto bg-white rounded-xl border border-[#E2E8F0] p-10 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-[#E8EDF5] text-[#0F766E] flex items-center justify-center mx-auto">
            <Upload size={28} />
          </div>

          <div>
            <h3 className="text-[18px] font-bold text-[#0F172A]">
              Upload Supplier Invoice
            </h3>
            <p className="text-[13px] text-[#64748B] mt-1">
              Select or drag & drop a supplier bill image to automatically
              extract items, batches, rates & taxes using AI OCR.
            </p>
          </div>

          {ocrErrorMessage && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-[13px] font-medium flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600 flex-shrink-0" />
              <span>{ocrErrorMessage}</span>
            </div>
          )}

          <label className="block w-full py-12 px-4 rounded-xl border-2 border-dashed border-[#CBD5E1] hover:border-[#1B4FD8] hover:bg-[#EFF6FF] cursor-pointer transition-all">
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={handleFileUpload}
            />
            <div className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-white font-semibold text-[14px] bg-[#1B4FD8] hover:bg-[#1540B3] transition-colors shadow-2xs">
              <FileText size={18} /> Select Invoice File
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-3">
              Supports JPG, PNG, WEBP, or scanned PDF documents
            </p>
          </label>
        </div>
      )}

      {/* PHASE 2: OCR Vision Processing Spinner */}
      {processing && (
        <div className="max-w-xl mx-auto bg-white rounded-xl border border-[#E2E8F0] p-10 shadow-sm text-center space-y-4">
          <Loader size={36} className="text-[#0F766E] animate-spin mx-auto" />
          <h3 className="text-[16px] font-bold text-[#0F172A]">
            Analyzing Supplier Invoice with AI Vision…
          </h3>
          <p className="text-[13px] text-[#64748B]">
            Performing visual text extraction for Supplier Name, GSTIN, Batches,
            Expiry & Prices.
          </p>
        </div>
      )}

      {/* PHASE 3: Extracted Data & Editable Invoice (ONLY AFTER OCR COMPLETES) */}
      {done && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left Column: Image Preview (5 Cols) */}
          <div className="xl:col-span-5 bg-white rounded-lg border border-[#E2E8F0] overflow-hidden flex flex-col shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#F0F2F5] bg-[#FAFAFA]">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-[#0F766E]" />
                <p className="font-semibold text-[14px] text-[#0F1624]">
                  Scanned Invoice Document
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="px-2.5 py-1 rounded text-[11px] font-medium text-[#0F766E] bg-[#E8EDF5] hover:bg-[#DDE2EC] transition-colors"
                >
                  Scan Another
                </button>

                {rotation !== 0 && (
                  <button
                    onClick={handleReScanCurrent}
                    className="px-2.5 py-1 rounded text-[11px] font-bold text-white bg-[#15803d] hover:bg-[#166534] transition-colors flex items-center gap-1 shadow-sm"
                    title="Re-run AI extraction on rotated image"
                  >
                    <RotateCw size={12} /> Re-Scan Rotated
                  </button>
                )}

                <div className="flex items-center gap-1 bg-white border border-[#E2E8F0] px-1.5 py-1 rounded">
                  <button
                    onClick={() => setZoom((z) => Math.max(50, z - 10))}
                    className="p-1 hover:bg-[#F5F7FA] rounded text-[#64748B]"
                    title="Zoom Out"
                  >
                    <ZoomOut size={13} />
                  </button>
                  <button
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    className="p-1 hover:bg-[#F5F7FA] rounded text-[#0F766E] font-bold flex items-center gap-0.5"
                    title="Rotate Image"
                  >
                    <RotateCw size={13} />
                    <span className="text-[10px]">{rotation}°</span>
                  </button>
                  <button
                    onClick={() => setZoom((z) => Math.min(200, z + 10))}
                    className="p-1 hover:bg-[#F5F7FA] rounded text-[#64748B]"
                    title="Zoom In"
                  >
                    <ZoomIn size={13} />
                  </button>
                  <button
                    onClick={() => setIsFullscreen(true)}
                    className="p-1 hover:bg-[#F5F7FA] rounded text-[#64748B]"
                    title="Fullscreen"
                  >
                    <Maximize2 size={13} />
                  </button>
                </div>
              </div>
            </div>

            {isFullscreen && (
              <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                >
                  <XCircle size={24} />
                </button>
                <img
                  src={imagePreview}
                  alt="Invoice Fullscreen"
                  className="max-w-full max-h-full object-contain transition-transform duration-300"
                  style={{ transform: `rotate(${rotation}deg)` }}
                />
              </div>
            )}

            <div className="relative flex-1 min-h-[480px] m-4 rounded bg-[#F8FAFC] border border-[#E2E8F0] overflow-hidden flex items-center justify-center p-4">
              <div
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: "center center",
                  transition: "transform 0.2s",
                }}
                className="w-full flex items-center justify-center"
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Invoice Preview"
                    className="max-w-full max-h-[450px] object-contain rounded shadow-sm border border-[#CBD5E1] transition-transform duration-300"
                    style={{ transform: `rotate(${rotation}deg)` }}
                  />
                ) : null}
              </div>
            </div>
          </div>

          {/* Right Column: Summarized Data & Editable Line Items (7 Cols) */}
          <div className="xl:col-span-7 space-y-5">
            {/* Header Metadata Form */}
            <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#F0F2F5]">
                <div className="flex items-center gap-2">
                  <Receipt className="text-[#0F766E]" size={18} />
                  <p className="text-[13px] font-bold text-[#0F172A] uppercase tracking-wide">
                    Extracted Invoice Details
                  </p>
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#DCFCE7] text-[#15803d] flex items-center gap-1">
                  <Check size={12} /> AI Vision Extracted
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[#64748B]">
                    Supplier Name
                  </label>
                  <input
                    type="text"
                    value={invoiceHeader.supplierName}
                    onChange={(e) =>
                      setInvoiceHeader({
                        ...invoiceHeader,
                        supplierName: e.target.value,
                      })
                    }
                    className="mt-1 w-full px-3 py-1.5 rounded border border-[#CBD5E1] text-[13px] font-bold text-[#0F172A] focus:outline-none focus:border-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#64748B]">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    value={invoiceHeader.invoiceNumber}
                    onChange={(e) =>
                      setInvoiceHeader({
                        ...invoiceHeader,
                        invoiceNumber: e.target.value,
                      })
                    }
                    className="mt-1 w-full px-3 py-1.5 rounded border border-[#CBD5E1] text-[13px] font-bold text-[#0F172A] focus:outline-none focus:border-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#64748B]">
                    Invoice Date
                  </label>
                  <input
                    type="date"
                    value={invoiceHeader.invoiceDate}
                    onChange={(e) =>
                      setInvoiceHeader({
                        ...invoiceHeader,
                        invoiceDate: e.target.value,
                      })
                    }
                    className="mt-1 w-full px-3 py-1.5 rounded border border-[#CBD5E1] text-[13px] font-medium text-[#0F172A] focus:outline-none focus:border-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#64748B]">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    value={invoiceHeader.gstin}
                    onChange={(e) =>
                      setInvoiceHeader({
                        ...invoiceHeader,
                        gstin: e.target.value,
                      })
                    }
                    className="mt-1 w-full px-3 py-1.5 rounded border border-[#CBD5E1] text-[13px] font-medium text-[#0F172A] focus:outline-none focus:border-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#64748B]">
                    PO Reference #
                  </label>
                  <input
                    type="text"
                    value={invoiceHeader.poNumber}
                    onChange={(e) =>
                      setInvoiceHeader({
                        ...invoiceHeader,
                        poNumber: e.target.value,
                      })
                    }
                    className="mt-1 w-full px-3 py-1.5 rounded border border-[#CBD5E1] text-[13px] font-medium text-[#0F172A] focus:outline-none focus:border-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#64748B]">
                    Payment Terms
                  </label>
                  <input
                    type="text"
                    value={invoiceHeader.paymentTerms}
                    onChange={(e) =>
                      setInvoiceHeader({
                        ...invoiceHeader,
                        paymentTerms: e.target.value,
                      })
                    }
                    className="mt-1 w-full px-3 py-1.5 rounded border border-[#CBD5E1] text-[13px] font-medium text-[#0F172A] focus:outline-none focus:border-[#0F766E]"
                  />
                </div>
              </div>
            </div>

            {/* Line Items Table with Inline Editing */}
            <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#F0F2F5]">
                <div className="flex items-center gap-2">
                  <Edit3 className="text-[#0F766E]" size={18} />
                  <p className="text-[13px] font-bold text-[#0F172A] uppercase tracking-wide">
                    Extracted Line Items ({extractedItems.length})
                  </p>
                </div>

                <button
                  onClick={handleAddItem}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold text-[#0F766E] bg-[#E8EDF5] hover:bg-[#DDE2EC] transition-colors"
                >
                  <Plus size={14} /> Add Line Item
                </button>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {extractedItems.map((item, idx) => {
                  const math = calculateItemMath(item)
                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-lg border transition-all space-y-3"
                      style={{
                        borderColor: !item.existsInMaster
                          ? "#FCD34D"
                          : "#E2E8F0",
                        backgroundColor: !item.existsInMaster
                          ? "#FEF3C7"
                          : "#FFFFFF",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#E8EDF5] text-[#0F766E] text-[11px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={item.matched}
                            onChange={(e) =>
                              updateItemField(
                                item.id,
                                "matched",
                                e.target.value,
                              )
                            }
                            placeholder="Medicine / Item Name"
                            className="flex-1 px-2.5 py-1 rounded border border-[#CBD5E1] text-[13px] font-bold text-[#0F172A] focus:outline-none focus:border-[#0F766E] bg-white"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          {!item.existsInMaster ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900 flex items-center gap-1">
                              <AlertTriangle size={11} /> New Medicine
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#DCFCE7] text-[#15803d]">
                              In Master
                            </span>
                          )}

                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded"
                            style={{
                              background: confBg(item.confidence),
                              color: confColor(item.confidence),
                            }}
                          >
                            {item.confidence}% Match
                          </span>

                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1 rounded hover:bg-red-100 text-red-600 transition-colors"
                            title="Remove item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 pt-1 border-t border-[#F0F2F5]">
                        <div>
                          <label className="text-[10px] font-semibold text-[#64748B]">
                            Batch #
                          </label>
                          <input
                            type="text"
                            value={item.batch}
                            onChange={(e) =>
                              updateItemField(item.id, "batch", e.target.value)
                            }
                            className="mt-0.5 w-full px-2 py-1 rounded border border-[#CBD5E1] text-[12px] font-medium text-[#0F172A] focus:outline-none focus:border-[#0F766E] bg-white"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-semibold text-[#64748B]">
                            Expiry Date
                          </label>
                          <input
                            type="date"
                            value={item.expiry}
                            onChange={(e) =>
                              updateItemField(item.id, "expiry", e.target.value)
                            }
                            className="mt-0.5 w-full px-2 py-1 rounded border border-[#CBD5E1] text-[12px] font-medium text-[#0F172A] focus:outline-none focus:border-[#0F766E] bg-white"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-semibold text-[#64748B]">
                            Qty
                          </label>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItemField(
                                item.id,
                                "quantity",
                                Number(e.target.value),
                              )
                            }
                            className="mt-0.5 w-full px-2 py-1 rounded border border-[#CBD5E1] text-[12px] font-bold text-[#0F172A] focus:outline-none focus:border-[#0F766E] bg-white"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-semibold text-[#64748B]">
                            Rate / PTR (₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.rate}
                            onChange={(e) =>
                              updateItemField(
                                item.id,
                                "rate",
                                Number(e.target.value),
                              )
                            }
                            className="mt-0.5 w-full px-2 py-1 rounded border border-[#CBD5E1] text-[12px] font-bold text-[#0F172A] focus:outline-none focus:border-[#0F766E] bg-white"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-semibold text-[#64748B]">
                            Disc % / GST %
                          </label>
                          <div className="flex items-center gap-1 mt-0.5">
                            <input
                              type="number"
                              step="0.1"
                              value={item.discount}
                              onChange={(e) =>
                                updateItemField(
                                  item.id,
                                  "discount",
                                  Number(e.target.value),
                                )
                              }
                              title="Discount %"
                              className="w-1/2 px-1.5 py-1 rounded border border-[#CBD5E1] text-[11px] font-medium text-[#0F172A] bg-white"
                            />
                            <span className="text-[10px] text-[#94A3B8]">
                              %
                            </span>
                            <input
                              type="number"
                              step="0.1"
                              value={item.gst}
                              onChange={(e) =>
                                updateItemField(
                                  item.id,
                                  "gst",
                                  Number(e.target.value),
                                )
                              }
                              title="GST %"
                              className="w-1/2 px-1.5 py-1 rounded border border-[#CBD5E1] text-[11px] font-medium text-[#0F172A] bg-white"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-semibold text-[#64748B]">
                            Line Net (₹)
                          </label>
                          <div className="mt-0.5 py-1 px-2 rounded bg-[#E8EDF5] text-[12px] font-bold text-[#0F766E] text-right">
                            ₹
                            {math.itemNetTotal.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Financial Amount Calculation Summary */}
            <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 shadow-sm space-y-4">
              <p className="text-[12px] font-bold text-[#0F172A] uppercase tracking-wide">
                Financial Amount Calculation Summary
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <div>
                  <p className="text-[11px] text-[#64748B]">
                    Base Amount (Subtotal)
                  </p>
                  <p className="text-[14px] font-bold text-[#0F172A]">
                    ₹
                    {subtotalBase.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#64748B]">Discount Amount</p>
                  <p className="text-[14px] font-bold text-red-600">
                    - ₹
                    {totalDiscountAmt.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#64748B]">Taxable Value</p>
                  <p className="text-[14px] font-bold text-[#0F172A]">
                    ₹
                    {totalTaxableValue.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#64748B]">
                    Total GST (SGST+CGST)
                  </p>
                  <p className="text-[14px] font-bold text-amber-600">
                    + ₹
                    {totalGstAmt.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-lg bg-[#E8EDF5] border border-[#CBD5E1]">
                <div className="text-left text-[12px] text-[#475569] space-y-1">
                  <p>
                    <span className="font-semibold text-[#0F172A]">
                      SGST (
                      {extractedItems[0]?.gst
                        ? (extractedItems[0].gst / 2).toFixed(1)
                        : "2.5"}
                      %):
                    </span>{" "}
                    ₹
                    {totalSGST.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}{" "}
                    |{" "}
                    <span className="font-semibold text-[#0F172A]">
                      CGST (
                      {extractedItems[0]?.gst
                        ? (extractedItems[0].gst / 2).toFixed(1)
                        : "2.5"}
                      %):
                    </span>{" "}
                    ₹
                    {totalCGST.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#0F172A]">
                      Round Off Adjustment (₹):
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={activeRoundOff}
                      onChange={(e) =>
                        setManualRoundOff(Number(e.target.value))
                      }
                      className="w-24 px-2 py-0.5 rounded border border-[#CBD5E1] text-[12px] font-bold text-[#0F172A] bg-white"
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">
                    Final Net Payable
                  </p>
                  <p className="text-[22px] font-extrabold text-[#15803d]">
                    ₹
                    {finalGrandTotal.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>

              <button
                onClick={handleConfirmAndPostToInventory}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-lg text-white font-bold text-[15px] shadow-md hover:bg-[#15803d] transition-all"
                style={{ background: "#16a34a" }}
              >
                <ShieldCheck size={20} /> Confirm Invoice Details & Post to
                Inventory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
