/**
 * Clinical Template Text Cleaner & Normalization Utility
 *
 * Extracts clean, human-readable structured template text from raw text,
 * JSON, XML, or Word document XML fragments without circular service dependencies.
 */

/**
 * Format JSON object or array into structured, readable template text
 * preserving section headings, field labels, observations, and tables.
 */
function formatJsonTemplate(data: any): string {
  if (typeof data !== "object" || data === null) {
    return String(data || "").trim()
  }

  // If array of section objects
  if (Array.isArray(data)) {
    const sections: string[] = []
    for (const item of data) {
      if (typeof item === "object" && item !== null) {
        const title = item.title || item.section || item.name || item.heading || item.label || ""
        const content = item.content || item.text || item.value || item.findings || item.description || ""
        if (title && content) {
          sections.push(`${String(title).toUpperCase().trim()}:\n${String(content).trim()}`)
        } else if (title) {
          sections.push(`${String(title).toUpperCase().trim()}:`)
        } else {
          sections.push(formatJsonTemplate(item))
        }
      } else {
        sections.push(`• ${String(item)}`)
      }
    }
    return sections.join("\n\n")
  }

  // If object with key-value pairs
  const resultLines: string[] = []
  for (const [key, val] of Object.entries(data)) {
    if (val === null || val === undefined) continue
    const formattedKey = key
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]/g, " ")
      .trim()
      .toUpperCase()

    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      resultLines.push(`${formattedKey}:\n${String(val).trim()}`)
    } else if (Array.isArray(val)) {
      if (val.length === 0) continue
      // Check if array of objects (table)
      if (typeof val[0] === "object" && val[0] !== null) {
        const headers = Object.keys(val[0])
        const headerRow = `| ${headers.map(h => h.toUpperCase()).join(" | ")} |`
        const dataRows = val.map(row => `| ${headers.map(h => String(row[h] ?? "")).join(" | ")} |`)
        resultLines.push(`${formattedKey}:\n${headerRow}\n${dataRows.join("\n")}`)
      } else {
        const listItems = val.map(v => `• ${String(v).trim()}`).join("\n")
        resultLines.push(`${formattedKey}:\n${listItems}`)
      }
    } else if (typeof val === "object") {
      resultLines.push(`${formattedKey}:\n${formatJsonTemplate(val)}`)
    }
  }

  return resultLines.join("\n\n").trim()
}

/**
 * Format XML document into structured clinical template text
 * preserving tables, headings, field labels, measurements, and line breaks.
 */
function formatXmlTemplate(xml: string): string {
  let text = xml

  // 1. Convert XML tables to markdown pipe tables
  text = text.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
    const rows: string[] = []
    const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
    let trMatch: RegExpExecArray | null

    while ((trMatch = trRegex.exec(tableContent)) !== null) {
      const rowInner = trMatch[1]
      const cells: string[] = []
      const cellRegex = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi
      let cMatch: RegExpExecArray | null

      while ((cMatch = cellRegex.exec(rowInner)) !== null) {
        const cellText = cMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        cells.push(cellText)
      }

      if (cells.length > 0) {
        rows.push(`| ${cells.join(" | ")} |`)
      }
    }

    return rows.length > 0 ? `\n\n${rows.join("\n")}\n\n` : ""
  })

  // 2. Convert <section title="..."> or <heading> to uppercase headings
  text = text.replace(/<section\b[^>]*\btitle=["']([^"']+)["'][^>]*>/gi, "\n\n$1:\n")
  text = text.replace(/<(?:heading|title|h[1-6])\b[^>]*>([\s\S]*?)<\/(?:heading|title|h[1-6])>/gi, "\n\n$1:\n")

  // 3. Convert clinical tag pairs like <findings>...</findings> into headings
  text = text.replace(/<([a-zA-Z0-9_-]+)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tagName, inner) => {
    const cleanTag = tagName.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").trim().toUpperCase()
    const cleanInner = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    if (!cleanInner) return ""
    // Only elevate clinically meaningful tags to headings
    const clinicalTags = ["FINDINGS", "IMPRESSION", "TECHNIQUE", "CLINICAL INDICATION", "INDICATION", "COMPARISON", "HISTORY", "OBSERVATIONS", "RECOMMENDATIONS", "CONCLUSION", "DIAGNOSIS"]
    if (clinicalTags.includes(cleanTag)) {
      return `\n\n${cleanTag}:\n${cleanInner}\n`
    }
    return ` ${cleanInner} `
  })

  // 4. Strip remaining HTML/XML tags
  text = text.replace(/<br\s*\/?>/gi, "\n")
  text = text.replace(/<\/p>/gi, "\n\n")
  text = text.replace(/<[^>]+>/g, " ")

  // 5. Decode common XML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")

  return cleanRawPlainText(text)
}

/**
 * Clean plain text content by removing control characters and normalizing whitespace
 */
export function cleanRawPlainText(text: string): string {
  const clean = text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")

  const lines = clean.split("\n").map(l => l.trimEnd())
  const result: string[] = []
  let consecutiveEmpty = 0

  for (const line of lines) {
    if (line.trim() === "") {
      consecutiveEmpty++
      if (consecutiveEmpty <= 2) {
        result.push("")
      }
    } else {
      consecutiveEmpty = 0
      result.push(line)
    }
  }

  return result.join("\n").trim()
}

/**
 * Universal Template Text Extractor and Formatter
 */
export function extractCleanTemplateText(param1: string, param2?: string): string {
  let fileName = "template.txt"
  let rawText = ""

  if (param2 !== undefined) {
    const p1IsFileName = param1.length < 255 && !param1.includes("\n") && /\.[a-zA-Z0-9]+$/.test(param1)
    const p2IsFileName = param2.length < 255 && !param2.includes("\n") && /\.[a-zA-Z0-9]+$/.test(param2)

    if (p1IsFileName && !p2IsFileName) {
      fileName = param1
      rawText = param2
    } else if (p2IsFileName && !p1IsFileName) {
      fileName = param2
      rawText = param1
    } else {
      fileName = param1
      rawText = param2
    }
  } else {
    rawText = param1 || ""
    fileName = "template.txt"
  }

  if (!rawText || !rawText.trim()) return ""

  const lowerName = fileName.toLowerCase()

  // ── 1. JSON Processing ──
  const isJson = lowerName.endsWith(".json") || (rawText.trim().startsWith("{") && rawText.trim().endsWith("}")) || (rawText.trim().startsWith("[") && rawText.trim().endsWith("]"))
  if (isJson) {
    try {
      const parsed = JSON.parse(rawText)
      return formatJsonTemplate(parsed)
    } catch {
      return cleanRawPlainText(rawText)
    }
  }

  // ── 2. Standalone XML Processing ──
  const isXml = lowerName.endsWith(".xml") || rawText.trim().startsWith("<?xml") || (rawText.trim().startsWith("<") && rawText.includes("</") && !rawText.includes("PK!"))
  if (isXml) {
    return formatXmlTemplate(rawText)
  }

  // ── 3. Word Binary ZIP / XML (word/document.xml) ──
  if (rawText.includes("PK!") || rawText.includes("word/document.xml") || lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
    const extractedLines: string[] = []

    const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g
    let pMatch: RegExpExecArray | null
    while ((pMatch = pRegex.exec(rawText)) !== null) {
      const pContent = pMatch[1]
      const tRegex = /<w:t\b[^>]*>(.*?)<\/w:t>/g
      let tMatch: RegExpExecArray | null
      let lineText = ""
      while ((tMatch = tRegex.exec(pContent)) !== null) {
        lineText += tMatch[1]
      }
      lineText = lineText
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .trim()

      if (lineText) {
        extractedLines.push(lineText)
      }
    }

    if (extractedLines.length === 0) {
      const cleanText = rawText
        .replace(/[^\x20-\x7E\n\r\t]/g, " ")
        .replace(/PK![\s\S]*?(\n|$)/g, "")
        .replace(/\[Content_Types\][\s\S]*?(\n|$)/g, "")
        .replace(/word\/[\s\S]*?(\n|$)/g, "")
        .replace(/docProps\/[\s\S]*?(\n|$)/g, "")
        .replace(/customXml\/[\s\S]*?(\n|$)/g, "")
        .replace(/xml[\s\S]*?(\n|$)/g, "")

      const lines = cleanText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 2 && !l.includes("xml") && !l.includes("_rels") && !l.includes("PK!"))
      return lines.join("\n\n")
    }

    return extractedLines.join("\n")
  }

  // ── 4. Plain Text (.txt, .md, .rtf) ──
  return cleanRawPlainText(rawText)
}

