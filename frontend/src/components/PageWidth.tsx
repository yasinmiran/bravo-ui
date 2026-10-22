import { createContext, useCallback, useContext, useRef, useState } from 'react'

const PageWidth = createContext<number | null>(null)

export const PageWidthProvider = PageWidth.Provider

/** Content-box width of the page area in px: the same number its container queries see. */
export function usePageWidth(): number | null {
  return useContext(PageWidth)
}

/** Observes an element's content-box width. Returns the width and a ref callback for the element. */
export function usePageObserver(): [number | null, (el: HTMLElement | null) => void] {
  const [width, setWidth] = useState<number | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w != null) setWidth(w)
    })
    ro.observe(el)
    observer.current = ro
  }, [])
  return [width, ref]
}
