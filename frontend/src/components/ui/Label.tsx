import * as React from "react"
import { cn } from "../../lib/cn"

function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("ui-label", className)} {...props} />
}

export default Label
