import { useEffect, useState } from "react"

/**
 * Whether a CSS media query currently matches, kept live as the window is
 * resized or a tablet is rotated.
 *
 * For layout decisions CSS cannot make on its own -- the app shell turning its
 * sidebar into a drawer, for instance, changes behaviour (closing on navigate),
 * not just appearance. Pure styling should stay in Tailwind breakpoints.
 */
export function useMediaQuery(query: string): boolean {
  const get = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false

  const [matches, setMatches] = useState(get)

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])

  return matches
}

export default useMediaQuery
