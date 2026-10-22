import { formatDate, formatDuration, type RulesVersionSummary } from '@/api'

export const SECTIONS = [
  { id: 'registry', label: 'Registry scores' },
  { id: 'general', label: 'General' },
  { id: 'types', label: 'Equipment types' },
  { id: 'redundancy', label: 'Redundancy' },
  { id: 'layers', label: 'Protection and evacuation' },
  { id: 'urgency', label: 'Urgency' },
  { id: 'overrides', label: 'Overrides' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

export const sectionAnchor = (id: SectionId) => `rules-${id}`
export const typeAnchor = (index: number) => `rules-type-${index}`
export const MISSING_TYPES_ANCHOR = 'rules-types-missing'

/** Model output is often lowercase; the document reads in sentence case. */
export function sentence(s: string): string {
  const t = s.trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

export const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

const versionOf = (id: string | undefined, versions: RulesVersionSummary[]) => versions.find((v) => v.id === id)?.version

/** "Extracted by claude-opus-5-5 in 42 s, 18,000 in / 6,000 out tokens", or "Edited from v2". */
export function originLine(v: RulesVersionSummary, versions: RulesVersionSummary[]): string {
  const { meta } = v
  if (v.origin === 'edited') {
    const from = versionOf(meta.edited_from, versions)
    return from ? `Edited from v${from}` : 'Written by hand'
  }
  const model = meta.model ?? 'the model'
  if (v.status === 'extracting') return `Extracting with ${model}`
  if (v.status === 'failed') return `Extraction with ${model} failed`
  let line = `Extracted by ${model}`
  if (meta.ms != null) line += ` in ${formatDuration(meta.ms)}`
  const usage = meta.usage
  if (usage && (usage.input_tokens || usage.output_tokens))
    line += `, ${usage.input_tokens.toLocaleString()} in / ${usage.output_tokens.toLocaleString()} out tokens`
  return line
}

/** The short form for the versions list. */
export function versionLine(v: RulesVersionSummary, versions: RulesVersionSummary[]): string {
  const when = formatDate(v.created_at)
  if (v.origin === 'edited') {
    const from = versionOf(v.meta.edited_from, versions)
    return from ? `Edited from v${from}, ${when}` : `Written by hand, ${when}`
  }
  if (v.status === 'extracting') return `Extracting since ${when}`
  if (v.status === 'failed') return `Extraction failed, ${when}`
  return `Extracted ${when}`
}

export const nextVersion = (versions: RulesVersionSummary[]) => Math.max(0, ...versions.map((v) => v.version)) + 1
