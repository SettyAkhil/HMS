import React, { useEffect, useState } from "react"
import { BRANDING_EVENT, BRAND_COLORS, getBranding, hospitalInitials, type Branding } from "../../lib/branding"

/** Current branding; follows logo changes made in settings, in this tab or another. */
export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(() => getBranding())
  useEffect(() => {
    const refresh = () => setBranding(getBranding())
    window.addEventListener(BRANDING_EVENT, refresh)
    window.addEventListener("storage", refresh)
    return () => {
      window.removeEventListener(BRANDING_EVENT, refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [])
  return branding
}

/** The hospital's uploaded logo, or its initials in a quiet badge until one is set. */
export function HospitalMark({ branding, height = 44 }: { branding: Branding ;height?: number }) {
  if (branding.hospitalLogo) {
    return (
      <img
        src={branding.hospitalLogo.src}
        alt={`${branding.hospitalName} logo`}
        style={{ height, width: Math.min(height * branding.hospitalLogo.ratio, height * 3.2) }}
        className="object-contain object-left shrink-0"
      />
    )
  }
  return (
    <span
      className="rounded-[10px] bg-[#1B4FD8] text-white font-bold flex items-center justify-center shrink-0 tracking-wide"
      style={{ width: height, height, fontSize: height * 0.36 }}
      title="Upload the hospital logo in Patient Messages → Settings"
    >
      {hospitalInitials(branding.hospitalName)}
    </span>
  )
}

/** HospAI mark + typeset wordmark ("Hosp" dark, "AI" red) -- legible on white paper. */
export function HospAIWordmark({ branding, height = 34, tagline = true }: { branding: Branding ;height?: number ;tagline?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 shrink-0">
      <img src={branding.hospaiMark} alt="" aria-hidden style={{ height, width: height * branding.hospaiMarkRatio }} className="object-contain" />
      <span className="leading-none">
        <span className="block font-extrabold tracking-[-0.02em]" style={{ fontSize: height * 0.56 }}>
          <span className="text-[#0F172A]">Hosp</span>
          <span style={{ color: BRAND_COLORS.hospaiRed }}>AI</span>
        </span>
        {tagline && <span className="block text-[#64748B] mt-1 font-medium tracking-[0.04em]" style={{ fontSize: Math.max(8.5, height * 0.25) }}>AI-driven healthcare</span>}
      </span>
    </span>
  )
}

/**
 * Letterhead for printed clinical documents: the hospital on the left, HospAI
 * on the right, the document's title and reference underneath.
 */
export function DocumentBrandHeader({
  branding,
  title,
  meta,
  department = "Department of Clinical Services",
}: {
  branding: Branding
  title: string
  meta?: React.ReactNode
  department?: string
}) {
  return (
    <div>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <HospitalMark branding={branding} />
          <div className="min-w-0">
            <div className="text-[17px] font-bold text-[#0F172A] tracking-[-0.01em] leading-tight">{branding.hospitalName}</div>
            <div className="text-[11.5px] text-[#64748B]">{department}</div>
            {branding.helpline && <div className="text-[11px] text-[#94A3B8]">Helpline {branding.helpline}</div>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <HospAIWordmark branding={branding} />
          <span className="text-[#CBD5E1] font-light hidden sm:inline">|</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[#64748B]">
            <img
              src={branding.kalpraMark}
              alt="Kalpra Tech"
              style={{ height: 18, width: 18 * branding.kalpraMarkRatio }}
              className="object-contain"
            />
            <span className="font-bold tracking-[0.02em] text-[#B02030]">
              Kalpra <span className="text-[#383868]">Tech</span>
            </span>
          </span>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="text-[12px] font-bold tracking-[0.16em] text-[#1B4FD8] uppercase">{title}</div>
        {meta && <div className="text-[11.5px] text-[#64748B]">{meta}</div>}
      </div>
    </div>
  )
}

/** "Powered by Kalpra Tech", for the foot of every printed document. */
export function PoweredByKalpra({ branding, className = "" }: { branding: Branding ;className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10.5px] text-[#94A3B8] whitespace-nowrap ${className}`}>
      Powered by
      <img src={branding.kalpraMark} alt="" aria-hidden style={{ height: 16, width: 16 * branding.kalpraMarkRatio }} className="object-contain" />
      <span className="font-bold tracking-[0.02em]" style={{ color: BRAND_COLORS.kalpraRed }}>
        Kalpra <span style={{ color: BRAND_COLORS.kalpraNavy }}>Tech</span>
      </span>
    </span>
  )
}

export default DocumentBrandHeader
