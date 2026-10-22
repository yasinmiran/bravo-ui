import { ApiError } from '@/api'

export function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

/** Backend messages arrive in lower case without a full stop; the screen shows them as sentences. */
export function sentence(text: string): string {
  const t = text.trim()
  if (!t) return t
  const s = t[0].toUpperCase() + t.slice(1)
  return /[.!?]$/.test(s) ? s : `${s}.`
}

export function firstLine(text: string | null | undefined): string {
  return (text ?? '').split('\n')[0].trim()
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Calendar dates from the findings file ("2026-06-02"), shown without a timezone shift. */
export function calendarDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return value
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(2)} s`
}

/** The row problems a 422 from an import or a submit carries. */
export function problemsOf(error: unknown): string[] {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== 'object') return []
  const problems = (error.body as { problems?: unknown }).problems
  return Array.isArray(problems) ? problems.map(String) : []
}

export type Gap = { kind: 'type'; value: string } | { kind: 'redundancy'; value: string } | { kind: 'other'; message: string }

/**
 * Coverage errors are sentences from the rules validator. The two an asset edit causes,
 * a type with no section and an unclassified redundancy string, are parsed so the screen
 * can name the value; anything else is shown as written.
 */
export function gapOf(message: string): Gap {
  const type = /^Equipment type (['"])(.*)\1 has no by_equipment_type section\.$/.exec(message)
  if (type) return { kind: 'type', value: type[2] }
  const red = /^Redundancy value (['"])(.*)\1 is not in redundancy_vocabulary\.$/.exec(message)
  if (red) return { kind: 'redundancy', value: red[2] }
  return { kind: 'other', message }
}


/** Loose check against an input's accept list, since a drop bypasses the file picker's filter. */
export function accepts(file: File, accept: string): boolean {
  const name = file.name.toLowerCase()
  return accept
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .some((a) => (a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a))
}
