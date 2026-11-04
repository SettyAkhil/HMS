import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { extractCardCode, patientPageUrl } from "../patientRecord/patientRecord"

/**
 * Scanning an OP card opens that patient's record page (`#/patient/<code>`)
 * in a new tab -- everything recorded about them end to end, with a download
 * of the complete history and a print of the card. The card carries the
 * patient's UMR, unique per patient (see db.adoptServerPatientId).
 */

export const OPEN_JOURNEY_EVENT = "hms:open-journey"

/** Open a patient's record page from anywhere in the app. */
export function openJourneyForCode(code: string) {
  window.dispatchEvent(new CustomEvent(OPEN_JOURNEY_EVENT, { detail: { code } }))
}

// What a card scan can produce: a patient id, or the card's QR link.
const CARD_CODE = /^(UMR\d{3,}|(ER-)?PAT-\d{3,}|OP\d{2,}|[A-Z]{2,5}-?\d{4,})$/i
const CARD_LINK = /#\/(patient|card)\/[^/?#\s]+/

/**
 * Handheld scanners "type" the code as a fast burst of keys, usually ending
 * in Enter (some send Tab, some nothing). A burst is told apart from a person
 * typing by the gaps between keys; Bluetooth scanners are slower than USB
 * ones, so the limits are generous, and a burst with no terminator still
 * counts once it stops, if it reads as a card code.
 */
export function useBarcodeScanner(onScan: (code: string) => void) {
  const buf = useRef("")
  const last = useRef(0)
  const gaps = useRef<number[]>([])
  const idle = useRef<number | undefined>(undefined)
  const lastTarget = useRef<EventTarget | null>(null)
  useEffect(() => {
    const isBurst = () => {
      const g = gaps.current
      if (g.length < 3) return false
      const avg = g.reduce((x, y) => x + y, 0) / g.length
      return avg < 50 && Math.max(...g) < 160
    }
    const looksLikeCard = (code: string) => CARD_CODE.test(code) || CARD_LINK.test(code)
    const take = (target: EventTarget | null) => {
      const code = buf.current.trim()
      const burst = isBurst()
      buf.current = ""
      gaps.current = []
      if (code.length < 4 || !burst || !looksLikeCard(code)) return false
      // A scan into a text field also typed the code there; take it back out.
      const t = target as HTMLInputElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA") && typeof t.value === "string" && t.value.endsWith(code)) {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t), "value")?.set
        setter?.call(t, t.value.slice(0, -code.length))
        t.dispatchEvent(new Event("input", { bubbles: true }))
      }
      onScan(extractCardCode(code))
      return true
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      window.clearTimeout(idle.current)
      const now = performance.now()
      const gap = now - last.current
      if (e.key === "Enter" || e.key === "Tab") {
        if (take(e.target)) {
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }
      if (e.key.length !== 1) return // Shift etc. -- not part of the code
      last.current = now
      if (gap > 300) {
        buf.current = ""
        gaps.current = []
      } else if (buf.current) {
        gaps.current.push(gap)
      }
      buf.current += e.key
      lastTarget.current = e.target
      // No terminator configured on the scanner: act when the burst stops.
      idle.current = window.setTimeout(() => take(lastTarget.current), 220)
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.clearTimeout(idle.current)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [onScan])
}

/** Mounted once in App: card scans and "open record" requests open the page. */
export default function JourneyScanHost(_props: {
  onNavigateToDoctorPortal?: (encId: string) => void
  onNavigateToOPWorkflow?: (encId: string, step?: number) => void
}) {
  // Set when the browser blocked the new tab; the link below is a real click.
  const [blocked, setBlocked] = useState<{ code: string ;url: string } | null>(null)

  const open = useCallback((raw: string) => {
    // A 2-D scanner reading the card's QR yields its no-login card link.
    const link = /#\/card\/[A-Za-z0-9_-]{20,64}/.exec(raw)
    const code = link ? link[0].slice("#/card/".length) : extractCardCode(raw)
    if (!code) return
    const url = link ? `${window.location.origin}${window.location.pathname}${link[0]}` : patientPageUrl(code)
    const win = window.open(url, "_blank")
    if (win) {
      setBlocked(null)
    } else {
      setBlocked({ code: code.toUpperCase(), url })
    }
  }, [])

  useBarcodeScanner(open)
  useEffect(() => {
    const onOpen = (e: Event) => {
      const code = (e as CustomEvent<{ code?: string }>).detail?.code
      if (code) open(code)
    }
    window.addEventListener(OPEN_JOURNEY_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_JOURNEY_EVENT, onOpen)
  }, [open])

  if (!blocked) return null
  return createPortal(
    <div className="fixed bottom-5 right-5 z-[80] bg-white border border-[#E2E8F0] shadow-lg px-4 py-3 text-[12.5px] flex items-center gap-3">
      <span>
        Card <span className="font-mono font-semibold">{blocked.code}</span> scanned.
      </span>
      <a
        href={blocked.url}
        target="_blank"
        rel="noopener"
        onClick={() => setBlocked(null)}
        className="font-semibold text-[#1B4FD8] hover:underline"
      >
        Open patient record →
      </a>
      <button type="button" onClick={() => setBlocked(null)} className="text-[#94A3B8] hover:text-[#0F172A] cursor-pointer" aria-label="Dismiss">
        ×
      </button>
    </div>,
    document.body,
  )
}
