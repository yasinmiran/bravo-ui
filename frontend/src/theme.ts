import { useSyncExternalStore } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const KEY = 'triage.theme'
const query = () => window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

export function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function resolve(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? (query().matches ? 'dark' : 'light') : mode
}

let mode: ThemeMode = readMode()

function apply() {
  document.documentElement.dataset.theme = resolve(mode)
  for (const fn of listeners) fn()
}

export function setMode(next: ThemeMode) {
  mode = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* private window */
  }
  apply()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  if (listeners.size === 1) query().addEventListener('change', apply)
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0) query().removeEventListener('change', apply)
  }
}

if (typeof document !== 'undefined') document.documentElement.dataset.theme = resolve(mode)

/** One store for every caller, so the switch, the toaster and the document never disagree. */
export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => mode)
  const resolved = useSyncExternalStore(subscribe, () => resolve(current))
  return { mode: current, setMode, resolved }
}
