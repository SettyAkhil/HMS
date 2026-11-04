import { useEffect, useRef, useState } from "react"
import { ChevronDown, Send } from "lucide-react"
import SendToPatientDialog, { type SendToPatientProps } from "./SendToPatientDialog"

/**
 * One "Send to patient" button with a choice of what to send -- for screens
 * that can send several things (the patient chart: EMR report, visit journey,
 * feedback request).
 */
export default function SendToPatientMenu({
  options,
  label = "Send to patient",
}: {
  options: (SendToPatientProps & { label: string ;hint?: string })[]
  label?: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", esc)
    }
  }, [menuOpen])

  const chosen = active === null ? null : options[active]

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="px-2.5 py-1 text-[11.5px] font-medium rounded-[6px] border border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D] hover:bg-[#DCFCE7] inline-flex items-center gap-1.5"
      >
        <Send size={12} aria-hidden /> {label} <ChevronDown size={12} aria-hidden />
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-64 bg-white border border-[#DDE2EC] rounded-[8px] shadow-lg z-30 py-1"
        >
          {options.map((o, i) => (
            <button
              key={o.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                setActive(i)
              }}
              className="w-full text-left px-3 py-2 hover:bg-[#F8FAFC]"
            >
              <div className="text-[12.5px] text-gray-900">{o.label}</div>
              {o.hint && <div className="text-[11px] text-[#64748B]">{o.hint}</div>}
            </button>
          ))}
        </div>
      )}
      {chosen && (
        <SendToPatientDialog
          open
          onClose={() => setActive(null)}
          patient={chosen.patient}
          kind={chosen.kind}
          vars={chosen.vars}
          buildDocument={chosen.buildDocument}
          documentLabel={chosen.documentLabel}
        />
      )}
    </div>
  )
}
