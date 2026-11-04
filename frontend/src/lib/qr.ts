import QRCode from "qrcode"

/**
 * QR code as an SVG string, built synchronously from the `qrcode` encoder's
 * module matrix. A 4-module quiet zone is included, as readers require it.
 */
export function qrSvg(
  text: string,
  { size = 120, color = "#000", ecc = "M" as "L" | "M" | "Q" | "H" } = {},
): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: ecc })
  const n = qr.modules.size
  const quiet = 4
  const dim = n + quiet * 2
  let path = ""
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(x, y)) path += `M${x + quiet} ${y + quiet}h1v1h-1z`
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${dim}" height="${dim}" fill="#fff"/>` +
    `<path d="${path}" fill="${color}"/></svg>`
  )
}
