import type { Bullet, Rules } from '@/api'

export type SourceKind = 'notes' | 'registry' | 'inferred' | 'other'

/** One citation. `detail` is what follows the prefix: a notes section, registry ids, or why it was inferred. */
export interface Source {
  kind: SourceKind
  detail: string
}

const PREFIX = /^(notes|registry|inferred)\b[\s:,-]*([\s\S]*)$/i

/**
 * Sources arrive as free text from the model: "notes: What moves likelihood", "registry: K-3401",
 * "inferred". Several may share one string, separated by semicolons.
 */
export function parseSources(raw: string): Source[] {
  const out: Source[] = []
  for (const part of raw.split(';')) {
    const text = part.trim()
    if (!text) continue
    const m = PREFIX.exec(text)
    if (m) out.push({ kind: m[1].toLowerCase() as SourceKind, detail: m[2].trim() })
    // a section name that itself contains a semicolon
    else if (out.length) out[out.length - 1].detail += `; ${text}`
    else out.push({ kind: 'other', detail: text })
  }
  return out
}

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** The source every bullet in the list shares, which then moves to the list heading. */
export function sharedSource(bullets: Bullet[]): string | null {
  const first = bullets[0]?.source.trim()
  if (!first) return null
  const key = normalize(first)
  return bullets.every((b) => normalize(b.source) === key) ? first : null
}

export function allBullets(rules: Rules): Bullet[] {
  const { likelihood, impact, pitfalls } = rules.general
  return [...likelihood.up, ...likelihood.down, ...impact.up, ...impact.down, ...pitfalls, ...Object.values(rules.by_equipment_type).flat()]
}

export const isInferred = (b: Bullet) => parseSources(b.source).some((s) => s.kind === 'inferred')
