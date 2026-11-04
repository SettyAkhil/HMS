import React from "react"
import { HOSPAI_LOGO_BASE64 } from "../assets/hospaiLogoBase64"

interface HospAILogoProps {
  className?: string
  variant?: "full" | "icon" | "horizontal"
  theme?: "dark" | "light"
  size?: number | string
}

export function HospAILogo({
  className = "h-10",
  variant = "horizontal",
  theme = "light",
  size,
}: HospAILogoProps) {
  const containerStyle = size ? { width: size, height: size } : undefined

  return (
    <img
      src={HOSPAI_LOGO_BASE64}
      alt="HospAI Logo"
      style={containerStyle}
      className={`object-contain shrink-0 ${className}`}
    />
  )
}

export default HospAILogo

