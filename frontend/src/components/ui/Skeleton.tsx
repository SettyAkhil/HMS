import React from "react"
import "./Skeleton.css"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circular" | "rectangular" | "rounded"
  width?: string | number
  height?: string | number
  animation?: "pulse" | "wave" | false
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = "text",
  width,
  height,
  animation = "pulse",
  className = "",
  style,
  ...props
}) => {
  const classes = [
    "skeleton",
    `skeleton--${variant}`,
    animation ? `skeleton--${animation}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ")

  const inlineStyle = {
    width: width,
    height: height,
    ...style,
  }

  return <div className={classes} style={inlineStyle} {...props} />
}
