import { EXTRACTION_STAGES, type EventStatus, type StageEvent } from '@/api'

export type StageState = 'done' | 'running' | 'failed' | 'waiting'

const IDS: string[] = EXTRACTION_STAGES.map((s) => s.id)

export const stageLabel = (id: string) => EXTRACTION_STAGES.find((s) => s.id === id)?.label ?? id

/**
 * Where the extraction stands. The latest event marks the current stage; stages after it
 * read as waiting even when an earlier attempt reached them, so a retry rewinds the track.
 */
export function stageStates(events: StageEvent[]): Record<string, StageState> {
  const states: Record<string, StageState> = Object.fromEntries(IDS.map((id) => [id, 'waiting']))
  const last = events.findLast((e) => IDS.includes(e.stage))
  if (!last) return states
  for (const id of IDS.slice(0, IDS.indexOf(last.stage) + 1)) {
    const e = events.findLast((x) => x.stage === id)
    if (e) states[id] = e.status === 'fail' ? 'failed' : e.status === 'start' ? 'running' : 'done'
  }
  return states
}

export interface EventRow {
  key: number
  stage: string
  status: EventStatus
  title: string
  startedAt: string
  attempt?: number
  errors?: string
}

function errorsOf(e: StageEvent): string | undefined {
  if (e.status !== 'fail') return undefined
  const v = e.detail.errors ?? e.detail.error
  if (!v) return undefined
  return Array.isArray(v) ? v.join('\n') : String(v)
}

/** One row per event, except that a start and the done or fail closing it fold into one row. */
export function foldEvents(events: StageEvent[]): EventRow[] {
  const rows: EventRow[] = []
  const open = new Map<string, number>()
  for (const e of events) {
    const attempt = typeof e.detail.attempt === 'number' ? e.detail.attempt : undefined
    const slot = `${e.stage}:${attempt ?? ''}`
    const at = open.get(slot)
    if (e.status !== 'start' && at !== undefined) {
      rows[at] = { ...rows[at], status: e.status, title: e.title, errors: errorsOf(e) }
      open.delete(slot)
      continue
    }
    if (e.status === 'start') open.set(slot, rows.length)
    rows.push({ key: e.id, stage: e.stage, status: e.status, title: e.title, startedAt: e.ts, attempt, errors: errorsOf(e) })
  }
  return rows
}

/** A folded model row reads "Attempt 1, reply in 1.2 s". */
export function rowTitle(row: EventRow): string {
  if (row.status === 'start' || row.attempt === undefined || row.stage !== 'model' || /^attempt/i.test(row.title)) return row.title
  return `Attempt ${row.attempt}, ${row.title[0].toLowerCase()}${row.title.slice(1)}`
}

export const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`
