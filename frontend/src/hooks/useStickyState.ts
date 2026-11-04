import { useEffect, useRef, useState } from "react"

/**
 * `useState` that survives the component being unmounted.
 *
 * App.tsx renders one module at a time (`{module === "register" && <Registration/>}`),
 * so navigating away unmounts the screen and every `useState` on it is destroyed.
 * A half-filled registration form, a set of vitals being typed, a chief complaint
 * mid-sentence -- all of it was silently gone the moment the user looked at
 * something else and came back.
 *
 * State is mirrored into `sessionStorage`, so it also survives a reload but dies
 * with the tab: a half-typed patient is a draft, not a record, and it should not
 * still be sitting there tomorrow for whoever next uses that machine at the front
 * desk. Call `clear()` once the data has been committed, so the next patient
 * starts from a clean form rather than inheriting the previous one's details.
 *
 * Storage failures are non-fatal by design -- private windows and full quotas
 * both throw -- and degrade to ordinary component state.
 */
export function useStickyState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const storageKey = `hospai_draft_${key}`

  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial
    try {
      const raw = window.sessionStorage.getItem(storageKey)
      return raw === null ? initial : JSON.parse(raw) as T
    } catch {
      return initial
    }
  })

  // Skip the write on the very first render: it would rewrite what we just read,
  // and for a never-touched form it would create an entry that makes a pristine
  // screen look like a saved draft.
  const hydrated = useRef(false)
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true
      return
    }
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      /* private window or quota exceeded -- keep working from memory */
    }
  }, [storageKey, value])

  const clear = () => {
    try {
      window.sessionStorage.removeItem(storageKey)
    } catch {
      /* nothing to do -- the in-memory reset below is what matters */
    }
    hydrated.current = false
    setValue(initial)
  }

  return [value, setValue, clear]
}
