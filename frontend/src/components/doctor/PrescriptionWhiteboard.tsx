import React, { useCallback, useEffect, useRef, useState } from "react"

/**
 * High-End Doctor Writing Canvas -- A fluid, vector-based digital prescription pad.
 *
 * Key Enhancements:
 * - Quadratic Bezier curve stroke smoothing for silk-smooth natural handwriting.
 * - Fountain Pen (variable stroke width), Ballpoint, and Highlighter pen modes.
 * - Paper presets: Ruled Pad, Rx Grid, Plain White, Dark Clinical.
 * - Undo & Redo vector history stack.
 * - Full-screen focus mode for spacious handwriting on stylus/touch devices.
 */

export interface Stroke {
  points: { x: number ;y: number }[]
  color: string
  width: number
  erase: boolean
  type?: "ballpoint" | "fountain" | "highlighter"
}

export const PEN_COLORS = [
  { value: "#1B4FD8", label: "Classic Blue" },
  { value: "#0F172A", label: "Onyx Black" },
  { value: "#DC2626", label: "Urgent Red" },
  { value: "#15803D", label: "Clinical Green" },
  { value: "#7C3AED", label: "Violet" },
  { value: "#EAB308", label: "Highlighter Yellow" },
]

export const PEN_WIDTHS = [
  { value: 2, label: "Fine (2px)" },
  { value: 3.5, label: "Medium (3.5px)" },
  { value: 6, label: "Bold (6px)" },
]

export const PAPER_STYLES = [
  { id: "ruled", label: "Ruled Pad" },
  { id: "grid", label: "Rx Grid" },
  { id: "plain", label: "Plain Paper" },
  { id: "dark", label: "Dark Mode" },
] as const

export type PaperStyle = typeof PAPER_STYLES[number]["id"]

const SHEET_WIDTH = 1200
const SHEET_HEIGHT = 820

export default function PrescriptionWhiteboard({
  header,
  onCommit,
  onDirtyChange,
  onDigitise,
  isDigitising,
}: {
  header?: {
    patientName: string
    umr: string
    opNumber: string
    age: number
    sex: string
    doctorName: string
    date: string
  }
  onCommit?: (dataUrl: string | null) => void
  onDirtyChange?: (hasInk: boolean) => void
  onDigitise?: (dataUrl: string) => void
  isDigitising?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const inkRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const redoRef = useRef<Stroke[]>([])
  const activeStrokeRef = useRef<Stroke | null>(null)

  const [color, setColor] = useState(PEN_COLORS[0].value)
  const [width, setWidth] = useState(PEN_WIDTHS[1].value)
  const [penType, setPenType] =
    useState<"ballpoint" | "fountain" | "highlighter">("fountain")
  const [erasing, setErasing] = useState(false)
  const [paperStyle, setPaperStyle] = useState<PaperStyle>("ruled")
  const [strokeCount, setStrokeCount] = useState(0)
  const [canRedo, setCanRedo] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)

  // Draw background paper template
  const drawPaperBackground = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.save()

      const isDark = paperStyle === "dark"
      const bgColor = isDark ? "#0F172A" : "#FFFFFF"
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT)

      // Grid / Ruled drawing
      if (paperStyle === "ruled") {
        ctx.strokeStyle = "#E2E8F0"
        ctx.lineWidth = 1
        for (let y = 140; y < SHEET_HEIGHT - 20; y += 38) {
          ctx.beginPath()
          ctx.moveTo(48, y)
          ctx.lineTo(SHEET_WIDTH - 48, y)
          ctx.stroke()
        }
      } else if (paperStyle === "grid") {
        ctx.strokeStyle = "#F1F5F9"
        ctx.lineWidth = 1
        for (let x = 48; x < SHEET_WIDTH - 48; x += 30) {
          ctx.beginPath()
          ctx.moveTo(x, 110)
          ctx.lineTo(x, SHEET_HEIGHT - 20)
          ctx.stroke()
        }
        for (let y = 110; y < SHEET_HEIGHT - 20; y += 30) {
          ctx.beginPath()
          ctx.moveTo(48, y)
          ctx.lineTo(SHEET_WIDTH - 48, y)
          ctx.stroke()
        }
      }

      // Header block divider line
      ctx.strokeStyle = isDark ? "#334155" : "#CBD5E1"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(48, 108)
      ctx.lineTo(SHEET_WIDTH - 48, 108)
      ctx.stroke()

      // Header details text
      ctx.fillStyle = isDark ? "#F8FAFC" : "#0F172A"
      ctx.font = "700 22px Inter, system-ui, sans-serif"
      ctx.fillText(header?.patientName || "Patient Consultation", 48, 52)

      ctx.fillStyle = isDark ? "#94A3B8" : "#64748B"
      ctx.font = "14px Inter, system-ui, sans-serif"
      const line = [
        header?.umr ? `UMR: ${header.umr}` : "",
        header?.opNumber ? `OP: ${header.opNumber}` : "",
        header ? `${header.age} yrs · ${header.sex}` : "",
      ]
        .filter(Boolean)
        .join("   ·   ")
      ctx.fillText(line || "General OPD Consultation Sheet", 48, 78)

      ctx.textAlign = "right"
      ctx.fillStyle = isDark ? "#F8FAFC" : "#0F172A"
      ctx.font = "600 15px Inter, system-ui, sans-serif"
      ctx.fillText(header?.doctorName || "", SHEET_WIDTH - 48, 52)
      ctx.fillStyle = isDark ? "#94A3B8" : "#64748B"
      ctx.font = "13px Inter, system-ui, sans-serif"
      ctx.fillText(
        header?.date || new Date().toLocaleDateString(),
        SHEET_WIDTH - 48,
        76,
      )
      ctx.textAlign = "left"

      // Rx Symbol
      ctx.fillStyle = isDark ? "#60A5FA" : "#1B4FD8"
      ctx.font = "italic 800 32px Georgia, serif"
      ctx.fillText("℞", 48, 142)

      ctx.restore()
    },
    [header, paperStyle],
  )

  // Smooth Bezier Curve Drawing Engine
  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length < 2) return

    ctx.save()
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    if (stroke.erase) {
      ctx.globalCompositeOperation = "destination-out"
      ctx.strokeStyle = "rgba(0,0,0,1)"
      ctx.lineWidth = stroke.width
    } else if (stroke.type === "highlighter") {
      ctx.globalCompositeOperation = "source-over"
      ctx.globalAlpha = 0.35
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width * 3.5
    } else {
      ctx.globalCompositeOperation = "source-over"
      ctx.globalAlpha = 1.0
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
    }

    ctx.beginPath()

    const points = stroke.points
    if (points.length === 2) {
      ctx.moveTo(points[0].x, points[0].y)
      ctx.lineTo(points[1].x, points[1].y)
    } else {
      ctx.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2
        const yc = (points[i].y + points[i + 1].y) / 2
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y)
    }

    ctx.stroke()
    ctx.restore()
  }

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const ratio = window.devicePixelRatio || 1
    if (canvas.width !== SHEET_WIDTH * ratio) {
      canvas.width = SHEET_WIDTH * ratio
      canvas.height = SHEET_HEIGHT * ratio
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

    // Render background paper
    drawPaperBackground(ctx)

    // Render ink layer offscreen
    if (!inkRef.current) inkRef.current = document.createElement("canvas")
    const ink = inkRef.current
    if (ink.width !== canvas.width) {
      ink.width = canvas.width
      ink.height = canvas.height
    }
    const inkCtx = ink.getContext("2d")
    if (!inkCtx) return

    inkCtx.setTransform(ratio, 0, 0, ratio, 0, 0)
    inkCtx.clearRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT)

    const all = activeStrokeRef.current
      ? [...strokesRef.current, activeStrokeRef.current]
      : strokesRef.current

    for (const stroke of all) {
      drawStroke(inkCtx, stroke)
    }

    // Composite ink onto canvas
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(ink, 0, 0)
    ctx.restore()
  }, [drawPaperBackground])

  useEffect(() => {
    redraw()
  }, [redraw])

  const exportCleanPrescription = useCallback(() => {
    if (strokesRef.current.length === 0) return null

    // Create a crisp 1200x820 offscreen canvas with pure white background,
    // clear black/slate text metadata, and sharp ink strokes (no ruled grid noise)
    const exportCanvas = document.createElement("canvas")
    exportCanvas.width = SHEET_WIDTH
    exportCanvas.height = SHEET_HEIGHT
    const ctx = exportCanvas.getContext("2d")
    if (!ctx) return null

    // 1. Pure white background
    ctx.fillStyle = "#FFFFFF"
    ctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT)

    // 2. High-contrast header divider
    ctx.strokeStyle = "#CBD5E1"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(48, 108)
    ctx.lineTo(SHEET_WIDTH - 48, 108)
    ctx.stroke()

    // 3. Header details in sharp dark slate
    ctx.fillStyle = "#0F172A"
    ctx.font = "700 22px Inter, system-ui, sans-serif"
    ctx.fillText(header?.patientName || "Patient Consultation", 48, 52)

    ctx.fillStyle = "#475569"
    ctx.font = "14px Inter, system-ui, sans-serif"
    const line = [
      header?.umr ? `UMR: ${header.umr}` : "",
      header?.opNumber ? `OP: ${header.opNumber}` : "",
      header ? `${header.age} yrs · ${header.sex}` : "",
    ]
      .filter(Boolean)
      .join("   ·   ")
    ctx.fillText(line || "General OPD Consultation Sheet", 48, 78)

    ctx.textAlign = "right"
    ctx.fillStyle = "#0F172A"
    ctx.font = "600 15px Inter, system-ui, sans-serif"
    ctx.fillText(header?.doctorName || "", SHEET_WIDTH - 48, 52)
    ctx.fillStyle = "#475569"
    ctx.font = "13px Inter, system-ui, sans-serif"
    ctx.fillText(
      header?.date || new Date().toLocaleDateString(),
      SHEET_WIDTH - 48,
      76,
    )
    ctx.textAlign = "left"

    // 4. Rx Symbol
    ctx.fillStyle = "#1B4FD8"
    ctx.font = "italic 800 32px Georgia, serif"
    ctx.fillText("℞", 48, 142)

    // 5. Render user ink strokes
    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke)
    }

    // Export as high-quality JPEG for compact size & rapid transmission (<100KB)
    return exportCanvas.toDataURL("image/jpeg", 0.90)
  }, [header])

  const commit = useCallback(() => {
    const hasInk = strokesRef.current.length > 0
    onDirtyChange?.(hasInk)
    const cleanDataUrl = hasInk ? exportCleanPrescription() : null
    onCommit?.(cleanDataUrl)
  }, [exportCleanPrescription, onCommit, onDirtyChange])

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * SHEET_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * SHEET_HEIGHT,
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    redoRef.current = []
    setCanRedo(false)

    let effectiveColor = color
    if (penType === "highlighter" && color === "#1B4FD8") {
      effectiveColor = "#EAB308" // default highlighter color
    }

    activeStrokeRef.current = {
      points: [pointFromEvent(event)],
      color: effectiveColor,
      width: erasing ? width * 5 : penType === "fountain" ? width * 1.1 : width,
      erase: erasing,
      type: penType,
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStrokeRef.current) return
    activeStrokeRef.current.points.push(pointFromEvent(event))
    redraw()
  }

  const handlePointerUp = () => {
    const stroke = activeStrokeRef.current
    activeStrokeRef.current = null
    if (!stroke) return

    if (stroke.points.length === 1) {
      stroke.points.push({
        x: stroke.points[0].x + 0.5,
        y: stroke.points[0].y + 0.5,
      })
    }

    strokesRef.current = [...strokesRef.current, stroke]
    setStrokeCount(strokesRef.current.length)
    redraw()
    commit()
  }

  const undo = () => {
    if (strokesRef.current.length === 0) return
    const last = strokesRef.current[strokesRef.current.length - 1]
    strokesRef.current = strokesRef.current.slice(0, -1)
    redoRef.current.push(last)
    setStrokeCount(strokesRef.current.length)
    setCanRedo(true)
    redraw()
    commit()
  }

  const redo = () => {
    if (redoRef.current.length === 0) return
    const restored = redoRef.current.pop()!
    strokesRef.current.push(restored)
    setStrokeCount(strokesRef.current.length)
    setCanRedo(redoRef.current.length > 0)
    redraw()
    commit()
  }

  const clear = () => {
    redoRef.current = [...strokesRef.current]
    strokesRef.current = []
    setStrokeCount(0)
    setCanRedo(true)
    redraw()
    commit()
  }

  const toolButton = (active: boolean) =>
    `px-3 py-1.5 text-[11.5px] font-semibold rounded-none border transition-all duration-150 flex items-center gap-1.5 ${
      active
        ? "bg-[#1B4FD8] text-white border-[#1B4FD8] shadow-sm"
        : "bg-white text-[#475569] border-[#CBD5E1] hover:border-[#94A3B8] hover:bg-[#F8FAFC]"
    }`

  const content = (
    <div className="space-y-3">
      {/* Dynamic Styling Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 bg-white border border-[#DDE2EC] p-3 rounded-none shadow-sm">
        {/* Pen Modes */}
        <div className="flex items-center bg-[#F1F5F9] p-1 rounded-none border border-[#E2E8F0] gap-1">
          <button
            type="button"
            onClick={() => {
              setPenType("fountain")
              setErasing(false)
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-none transition-all ${
              penType === "fountain" && !erasing
                ? "bg-white text-[#1B4FD8] shadow-sm"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            ✒️ Fountain
          </button>
          <button
            type="button"
            onClick={() => {
              setPenType("ballpoint")
              setErasing(false)
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-none transition-all ${
              penType === "ballpoint" && !erasing
                ? "bg-white text-[#1B4FD8] shadow-sm"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            🖊️ Fine Pen
          </button>
          <button
            type="button"
            onClick={() => {
              setPenType("highlighter")
              setErasing(false)
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-none transition-all ${
              penType === "highlighter" && !erasing
                ? "bg-white text-[#1B4FD8] shadow-sm"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            🖍️ Marker
          </button>
        </div>

        <span className="w-px h-6 bg-[#E2E8F0]" />

        {/* Ink Colors */}
        <div className="flex items-center gap-1.5">
          {PEN_COLORS.map((pen) => (
            <button
              key={pen.value}
              type="button"
              title={pen.label}
              onClick={() => {
                setColor(pen.value)
                setErasing(false)
              }}
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                color === pen.value && !erasing
                  ? "border-[#1B4FD8] scale-110 shadow-sm"
                  : "border-white"
              }`}
              style={{
                backgroundColor: pen.value,
                boxShadow: "0 0 0 1px #CBD5E1",
              }}
            />
          ))}
        </div>

        <span className="w-px h-6 bg-[#E2E8F0]" />

        {/* Thickness */}
        <div className="flex items-center gap-1">
          {PEN_WIDTHS.map((pen) => (
            <button
              key={pen.value}
              type="button"
              onClick={() => setWidth(pen.value)}
              className={toolButton(width === pen.value)}
            >
              {pen.label}
            </button>
          ))}
        </div>

        <span className="w-px h-6 bg-[#E2E8F0]" />

        {/* Eraser & History */}
        <button
          type="button"
          onClick={() => setErasing((v) => !v)}
          className={toolButton(erasing)}
        >
          🧹 Eraser
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={!strokeCount}
          className={`${toolButton(false)} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          ↩️ Undo
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          className={`${toolButton(false)} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          ↪️ Redo
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={!strokeCount}
          className={`${toolButton(false)} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          🗑️ Clear Sheet
        </button>

        <span className="w-px h-6 bg-[#E2E8F0]" />

        {/* Paper Style Selector */}
        <div className="flex items-center gap-1">
          {PAPER_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              onClick={() => setPaperStyle(style.id)}
              className={`px-2 py-1 text-[11px] font-semibold rounded-none border transition-colors ${
                paperStyle === style.id
                  ? "bg-[#0F172A] text-white border-[#0F172A]"
                  : "bg-white text-[#64748B] border-[#CBD5E1] hover:border-[#94A3B8]"
              }`}
            >
              {style.label}
            </button>
          ))}
        </div>

        {/* Fullscreen Expand Toggle */}
        <button
          type="button"
          onClick={() => setIsFullScreen((fs) => !fs)}
          className="ml-auto px-3 py-1.5 text-[11.5px] font-bold rounded-none border border-[#CBD5E1] bg-white text-[#1E293B] hover:bg-[#F8FAFC]"
        >
          {isFullScreen ? "📉 Exit Fullscreen" : "⛶ Fullscreen Canvas"}
        </button>

        {/* Instant Digitise Sheet Action Button */}
        {onDigitise && (
          <button
            type="button"
            onClick={() => {
              const dataUrl = exportCleanPrescription()
              if (dataUrl) onDigitise(dataUrl)
            }}
            disabled={strokeCount === 0 || isDigitising}
            className={`px-3 py-1.5 text-[11.5px] font-bold rounded-none border flex items-center gap-1.5 transition-all shadow-sm ${
              isDigitising
                ? "bg-[#EFF6FF] text-[#1B4FD8] border-[#93C5FD] cursor-wait"
                : strokeCount === 0
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60"
                : "bg-[#1B4FD8] hover:bg-[#153eb2] text-white border-[#1B4FD8] cursor-pointer active:scale-95"
            }`}
          >
            {isDigitising ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                <span>Digitising…</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>Digitise Sheet</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Interactive Drawing Canvas Container */}
      <div
        className={`border border-[#DDE2EC] rounded-none overflow-hidden shadow-sm relative transition-all ${
          paperStyle === "dark" ? "bg-[#0F172A]" : "bg-white"
        }`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full block touch-none cursor-crosshair"
          style={{
            aspectRatio: `${SHEET_WIDTH} / ${SHEET_HEIGHT}`,
            maxWidth: "100%",
          }}
        />

        {/* Footer status text */}
        <div className="absolute bottom-3 right-4 bg-white/80 backdrop-blur px-3 py-1 rounded-none border border-slate-200 text-[11px] text-[#64748B] shadow-sm pointer-events-none">
          {strokeCount
            ? `✍️ ${strokeCount} active stroke${strokeCount === 1 ? "" : "s"}`
            : "🖊️ Draw or write clinical prescription here"}
        </div>
      </div>
    </div>
  )

  if (isFullScreen) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md p-6 flex flex-col justify-center overflow-y-auto">
        <div className="max-w-6xl w-full mx-auto bg-white p-4 rounded-none shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Full-Screen Prescription Whiteboard Workspace
              </h2>
              <p className="text-xs text-slate-500">
                Fluid digital handwriting surface for high-resolution clinical
                notes
              </p>
            </div>
            <button
              onClick={() => setIsFullScreen(false)}
              className="px-4 py-2 bg-slate-900 text-white rounded-none text-xs font-bold hover:bg-slate-800"
            >
              Done & Return ✕
            </button>
          </div>
          {content}
        </div>
      </div>
    )
  }

  return content
}
