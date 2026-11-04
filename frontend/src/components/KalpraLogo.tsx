import React from "react"
import { KALPRA_LOGO_BASE64 } from "../assets/kalpraLogoBase64"

export function KalpraLogo({
  className = "h-9",
  dark = false,
}: {
  className?: string
  dark?: boolean
}) {
  return (
    <img
      src={KALPRA_LOGO_BASE64}
      alt="Kalpra Logo"
      className={`object-contain shrink-0 ${className}`}
    />
  )
}

export default KalpraLogo

