import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { usePageWidth } from '@/components/PageWidth'

/** Wall clock that ticks while active and freezes otherwise. */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [active, intervalMs])
  return now
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', onChange)
      return () => m.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

/** Below 60rem of page width (or viewport) the workbench becomes a list and the detail a sheet. */
export function useIsPhone(): boolean {
  const viewport = useMediaQuery('(max-width: 59.99rem)')
  const page = usePageWidth()
  return viewport || (page != null && page < 960)
}

