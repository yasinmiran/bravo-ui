import {
  BANDS,
  DEFAULT_BANDS,
  PROCESS_STAGES,
  bandLabel,
  findingPosition,
  groupByFinding,
  type BandName,
  type Decision,
  type EventStatus,
  type FindingRecord,
  type FiredOverride,
  type Gate,
  type Rules,
  type StageEvent,
  type TicketRow,
} from '@/api'

// ---------- stages ----------

/** The per-lane track: every process stage except Finish, which happens once for the batch. */
export const LANE_STAGES = PROCESS_STAGES.filter((s) => s.id !== 'finish')

export function stageIndex(id: string): number {
  return LANE_STAGES.findIndex((s) => s.id === id)
}

const NOTES = stageIndex('notes')
const PROMPT = stageIndex('prompt')
const MODEL = stageIndex('model')
const TICKET = stageIndex('ticket')

const EXTRA_LABELS: Record<string, string> = { start: 'Start', finding: 'Picked up' }

export function stageLabel(id: string): string {
  return PROCESS_STAGES.find((s) => s.id === id)?.label ?? EXTRA_LABELS[id] ?? humanize(id)
}

// ---------- narrowing event details the shared type leaves open ----------

export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
export const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
export const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export function workerName(e: StageEvent | undefined | null): string {
  return (str(e?.detail.worker) ?? 'a worker').replace(/_/g, ' ')
}

// ---------- lanes ----------

export type LanePhase = 'queued' | 'running' | 'drafted' | 'failed'

export interface LaneOutcome {
  ticketId: string
  urgency: number
  band: BandName | null
  reviewRequired: boolean
  failed: boolean
}

export interface Lane {
  finding: FindingRecord
  events: StageEvent[]
  phase: LanePhase
  /** Index into LANE_STAGES where the lane's head marker sits. */
  head: number
  /** How many LANE_STAGES the lane has fully passed. */
  passed: number
  worker: string | null
  attempts: number
  /** Stage index to the number of failed attempts there that were retried. */
  retries: Record<number, number>
  /** Stage indexes where a failure was final. */
  fails: number[]
  pickedAt: number | null
  endedAt: number | null
  outcome: LaneOutcome | null
  hasFail: boolean
}

/**
 * Where one finding stands. Batch notes for every finding are written before any worker
 * starts, so "queued" means notes done and no pick-up event yet, whatever findingPosition says.
 * A start, or a done of any stage but Ticket, means the lane is running; a failure that the
 * pipeline retries sends the head back to the model call.
 */
export function deriveLane(finding: FindingRecord, events: StageEvent[], intakeDone: boolean): Lane {
  const picked = events.find((e) => e.stage === 'finding')
  const ticket = events.findLast((e) => e.stage === 'ticket')
  const modelStarts = events.filter((e) => e.stage === 'model' && e.status === 'start')
  const retries: Record<number, number> = {}
  const fails: number[] = []
  for (const e of events) {
    if (e.status !== 'fail') continue
    const at = stageIndex(e.stage)
    if (at < 0) continue
    const retried = modelStarts.some((m) => m.id > e.id) || (e.detail.retry === true && !ticket)
    if (retried) retries[at] = (retries[at] ?? 0) + 1
    else fails.push(at)
  }

  let phase: LanePhase
  let head: number
  let passed: number
  if (ticket) {
    phase = ticket.status === 'fail' ? 'failed' : 'drafted'
    head = TICKET
    passed = LANE_STAGES.length
  } else if (!picked) {
    phase = 'queued'
    head = events.some((e) => e.stage === 'notes') ? PROMPT : intakeDone ? NOTES : 0
    passed = head
  } else {
    phase = 'running'
    const pos = findingPosition(events)
    if (pos.stage === 'queued' || pos.stage === 'picked' || pos.stage === 'notes') head = PROMPT
    else if (pos.open) head = stageIndex(pos.stage)
    else {
      const last = events.findLast((e) => e.stage === pos.stage)
      head = last?.status === 'fail' && last.detail.retry === true ? MODEL : Math.min(stageIndex(pos.stage) + 1, TICKET)
    }
    passed = head
  }

  return {
    finding,
    events,
    phase,
    head,
    passed,
    worker: picked ? workerName(picked) : null,
    attempts: modelStarts.length,
    retries,
    fails,
    pickedAt: picked ? Date.parse(picked.ts) : null,
    endedAt: ticket ? Date.parse(ticket.ts) : null,
    outcome: ticket
      ? {
          ticketId: str(ticket.detail.ticket_id) ?? '',
          urgency: num(ticket.detail.urgency) ?? 10,
          band: (str(ticket.detail.band) as BandName | null) ?? null,
          reviewRequired: ticket.detail.review_required === true,
          failed: ticket.status === 'fail',
        }
      : null,
    hasFail: events.some((e) => e.status === 'fail'),
  }
}

export function deriveLanes(findings: FindingRecord[], events: StageEvent[]): Lane[] {
  const byFinding = groupByFinding(events)
  const intakeDone = events.some((e) => !e.finding_id && e.stage === 'intake')
  return findings.map((f) => deriveLane(f, byFinding.get(f.finding_id) ?? [], intakeDone))
}

export interface StageCount {
  passed: number
  now: string[]
  waiting: number
}

/** Counted from lane positions, never from events, so a retry does not count twice. */
export function stageCounts(lanes: Lane[]): StageCount[] {
  return LANE_STAGES.map((_, i) => ({
    passed: lanes.filter((l) => l.passed > i).length,
    now: lanes.filter((l) => l.phase === 'running' && l.head === i).map((l) => l.finding.finding_id),
    waiting: lanes.filter((l) => l.phase === 'queued' && l.head === i).length,
  }))
}

export type LaneFilter = 'all' | 'progress' | 'queued' | 'drafted' | 'retried' | 'failed'

export const LANE_FILTERS: { id: LaneFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'progress', label: 'In progress' },
  { id: 'queued', label: 'Queued' },
  { id: 'drafted', label: 'Drafted' },
  { id: 'retried', label: 'Retried' },
  { id: 'failed', label: 'Failed' },
]

export function laneMatches(lane: Lane, filter: LaneFilter): boolean {
  switch (filter) {
    case 'progress':
      return lane.phase === 'running'
    case 'queued':
      return lane.phase === 'queued'
    case 'drafted':
      return lane.phase === 'drafted'
    case 'retried':
      return lane.attempts > 1
    case 'failed':
      return lane.phase === 'failed'
    default:
      return true
  }
}

export function notesSummary(events: StageEvent[]): { notes: number; findings: number; kinds: Record<string, number> } {
  let notes = 0
  let findings = 0
  const kinds: Record<string, number> = {}
  for (const e of events) {
    if (e.stage !== 'notes' || !e.finding_id) continue
    const items = list<{ kind: string }>(e.detail.notes)
    notes += items.length
    if (items.length) findings += 1
    for (const n of items) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1
  }
  return { notes, findings, kinds }
}

// ---------- ladder ----------

export interface LadderEntry {
  key: number
  stage: string
  status: EventStatus
  ts: string
  title: string
  /** The start event when a start and its outcome fold into one row. */
  start?: StageEvent
  /** The settling event, or the only one. */
  event: StageEvent
}

function modelTitle(e: StageEvent): string {
  const attempt = num(e.detail.attempt) ?? 1
  if (e.status === 'start') return `Attempt ${attempt}, waiting for the reply`
  if (e.status === 'fail') return `Attempt ${attempt} failed`
  const ms = num(e.detail.ms)
  return `Attempt ${attempt}, reply in ${ms == null ? '?' : (ms / 1000).toFixed(1)} s${e.detail.cached ? ', from cache' : ''}`
}

/** One row per event, except that a model start folds with its reply and the pick-up folds into Prompt. */
export function ladderEntries(events: StageEvent[]): LadderEntry[] {
  const out: LadderEntry[] = []
  let pick: LadderEntry | null = null
  for (const e of events) {
    if (e.stage === 'finding') {
      pick = { key: e.id, stage: 'prompt', status: 'start', ts: e.ts, title: `Picked up by ${workerName(e)}`, start: e, event: e }
      out.push(pick)
      continue
    }
    if (e.stage === 'prompt' && pick) {
      Object.assign(pick, { status: e.status, title: `${e.title}, picked up by ${workerName(pick.start)}`, event: e })
      pick = null
      continue
    }
    if (e.stage === 'model' && e.status !== 'start') {
      const open = out.findLast((r) => r.stage === 'model' && r.status === 'start' && r.event.detail.attempt === e.detail.attempt)
      if (open) {
        Object.assign(open, { status: e.status, title: modelTitle(e), event: e })
        continue
      }
    }
    out.push({
      key: e.id,
      stage: e.stage,
      status: e.status,
      ts: e.ts,
      title: e.stage === 'model' ? modelTitle(e) : e.title,
      start: e.status === 'start' ? e : undefined,
      event: e,
    })
  }
  return out
}

/** Titles written for a person; the backend's own title where it already reads well. */
export function entryTitle(entry: LadderEntry): string {
  const e = entry.event
  switch (entry.stage) {
    case 'notes': {
      const n = list(e.detail.notes).length
      return n ? `${plural(n, 'batch note')} found` : 'No batch notes, nothing the finding alone would hide'
    }
    case 'review': {
      const n = list(e.detail.reasons).length
      return n ? plural(n, 'review trigger') : 'No review trigger, straight to the queue'
    }
    case 'urgency': {
      if (e.status !== 'done') return entry.title
      const k = list(e.detail.overrides).length
      return `Urgency ${num(e.detail.score) ?? '?'}, ${bandLabel(str(e.detail.band)).toLowerCase()}${k ? `, ${plural(k, 'override')} fired` : ''}`
    }
    default:
      return entry.title
  }
}

/** Stages after the head that have no row yet, so the whole sequence shows from the first second. */
export function unreachedStages(lane: Lane, entries: LadderEntry[]): string[] {
  if (lane.phase === 'drafted' || lane.phase === 'failed') return []
  const seen = new Set(entries.map((r) => r.stage))
  return LANE_STAGES.slice(Math.max(lane.head, NOTES))
    .map((s) => s.id)
    .filter((id) => !seen.has(id))
}

// ---------- bands and tickets ----------

export type Bands = Record<BandName, [number, number]>

export function bandOf(score: number | null | undefined, bands: Bands = DEFAULT_BANDS): BandName | null {
  if (score == null) return null
  for (const b of BANDS) {
    const [lo, hi] = bands[b.name]
    if (score >= lo && score <= hi) return b.name
  }
  return null
}

/** A failed triage has no urgency trace, so no band; it is scored 10 and sorts into today. */
export const rowBand = (row: TicketRow, bands: Bands): BandName | null => row.band ?? bandOf(row.ticket.urgency.score, bands)

const byTicketId = (a: TicketRow, b: TicketRow) => a.ticket.ticket_id.localeCompare(b.ticket.ticket_id, undefined, { numeric: true })

export function sortTickets(rows: TicketRow[]): TicketRow[] {
  return [...rows].sort((a, b) => b.ticket.urgency.score - a.ticket.urgency.score || byTicketId(a, b))
}

export interface TicketFilters {
  bands: BandName[]
  review: boolean
  sce: boolean
  decision: 'all' | Decision
  query: string
}

export const NO_FILTERS: TicketFilters = { bands: [], review: false, sce: false, decision: 'all', query: '' }

export const filtersActive = (f: TicketFilters) => f.bands.length > 0 || f.review || f.sce || f.decision !== 'all' || f.query.trim() !== ''

export function queryMatches(query: string, fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  return !q || fields.some((v) => v?.toLowerCase().includes(q))
}

export function ticketMatches(row: TicketRow, f: TicketFilters, bands: Bands): boolean {
  const band = rowBand(row, bands)
  if (f.bands.length && (!band || !f.bands.includes(band))) return false
  if (f.review && !row.ticket.review_required) return false
  if (f.sce && !row.safety_critical_element) return false
  if (f.decision !== 'all' && row.decision !== f.decision) return false
  const t = row.ticket
  return queryMatches(f.query, [t.ticket_id, t.finding_id, t.equipment_id, t.summary])
}

// ---------- urgency derivation ----------

export type StepState = 'start' | 'changed' | 'unchanged' | 'na'

export interface UrgencyStep {
  id: string
  name: string
  why: string
  value: number
  state: StepState
  reason?: string
}

export interface UrgencyInput {
  base: number
  gates: Gate[]
  overrides: FiredOverride[]
  score: number
}

const changed = (a: number, b: number) => Math.abs(a - b) > 1e-9

function gateStep(g: Gate, prev: number, L: number, I: number, sce: boolean | null, r: Rules['urgency'] | null): UrgencyStep {
  let applies: boolean | null = null
  let why = capitalize(g.condition)
  switch (g.id) {
    case 'near_certain':
      if (r) {
        const t = r.near_certain.likelihood_at_least
        applies = L >= t
        why = applies ? `Likelihood ${L} is at least ${t}, so the base lifts to at least impact ${I}` : `Likelihood ${L} is below ${t}`
      }
      break
    case 'inconsequential':
      if (r) {
        const { impact_at_most: t, urgency_at_most: cap } = r.inconsequential
        applies = I <= t
        why = applies ? `Impact ${I} is at most ${t}, so urgency is capped at ${cap}` : `Impact ${I} is above ${t}, no cap`
      }
      break
    case 'rounding':
      applies = true
      why = 'Half rounds up'
      break
    case 'sce_floor':
      if (sce === false) {
        applies = false
        why = 'Not a safety critical element'
      } else if (r && sce) {
        const { impact_at_least: t, urgency_at_least: floor } = r.sce_floor
        applies = I >= t
        why = applies ? `Safety critical element with impact ${I}, at least ${floor}` : `Safety critical element, but impact ${I} is below ${t}`
      }
      break
  }
  const moved = changed(g.value, prev)
  return { id: g.id, name: g.name, why, value: g.value, state: moved ? 'changed' : applies === false ? 'na' : 'unchanged' }
}

/** The code's steps in order: weighted base, each gate, then each override that fired. */
export function urgencySteps(
  u: UrgencyInput,
  scores: { likelihood: number; impact: number },
  sce: boolean | null,
  rules: Rules | null,
): UrgencyStep[] {
  const r = rules?.urgency ?? null
  const { likelihood: L, impact: I } = scores
  const steps: UrgencyStep[] = [
    {
      id: 'base',
      name: 'Weighted base',
      why: r ? `${r.weights.impact} × impact ${I} + ${r.weights.likelihood} × likelihood ${L}` : `Impact ${I} and likelihood ${L}, impact weighted`,
      value: u.base,
      state: 'start',
    },
  ]
  let prev = u.base
  for (const g of u.gates) {
    steps.push(gateStep(g, prev, L, I, sce, r))
    prev = g.value
  }
  for (const o of u.overrides) {
    const value = Math.max(prev, o.floor)
    steps.push({
      id: o.id,
      name: `Override, ${humanize(o.id).toLowerCase()}`,
      why: `${capitalize(o.evidence)}. At least ${o.floor}.`,
      value,
      state: changed(value, prev) ? 'changed' : 'unchanged',
      reason: capitalize(o.reason),
    })
    prev = value
  }
  return steps
}

export const STEP_STATE: Record<StepState, string> = {
  start: 'Starting value',
  changed: 'Changed the value',
  unchanged: 'Checked, no change',
  na: 'Not applicable',
}

/** Floors that apply, as ticks on the number line. */
export function floorTicks(steps: UrgencyStep[], overrides: FiredOverride[], rules: Rules | null): { value: number; label: string }[] {
  const ticks: { value: number; label: string }[] = []
  const sce = steps.find((s) => s.id === 'sce_floor')
  if (sce && sce.state !== 'na' && rules) ticks.push({ value: rules.urgency.sce_floor.urgency_at_least, label: `SCE floor ${rules.urgency.sce_floor.urgency_at_least}` })
  for (const o of overrides) {
    const same = ticks.find((t) => t.value === o.floor)
    if (same) same.label += ', override'
    else ticks.push({ value: o.floor, label: `Override ${o.floor}` })
  }
  return ticks
}

/** Band segments on a 1 to 10 line, split halfway between neighbouring integers. */
export function bandSegments(bands: Bands): { band: BandName; from: number; to: number }[] {
  return BANDS.map((b) => {
    const [lo, hi] = bands[b.name]
    return { band: b.name, from: lo <= 1 ? 1 : lo - 0.5, to: hi >= 10 ? 10 : hi + 0.5 }
  })
}

// ---------- words ----------

export const NOTE_KINDS: Record<string, string> = {
  sibling: 'Other finding on this equipment',
  partner_has_finding: 'Partner has a finding',
  partner_unverified: 'Partner not in registry',
  voted_group: 'Voted group',
  redundancy_unclassified: 'Redundancy not in vocabulary',
}

export const noteKind = (kind: string) => NOTE_KINDS[kind] ?? humanize(kind)

export const ATTEMPT_OUTCOME: Record<string, string> = {
  accepted: 'Accepted',
  validation_error: 'Failed validation',
  invariant_violation: 'Failed an invariant check',
  model_error: 'Model call failed',
}

/** "Safety Critical Element: every ticket ..." becomes a bold lead sentence and the rest. */
export function splitReason(reason: string): [string, string] {
  const m = /^(.*?)[:;]\s+(.*)$/.exec(reason.trim())
  if (!m) return [reason.trim(), '']
  return [`${m[1].replace(/\.$/, '')}.`, capitalize(m[2])]
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function humanize(id: string): string {
  return capitalize(id.replace(/_/g, ' '))
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function formatChars(n: number | null): string {
  if (n == null) return '?'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export function formatTokens(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-GB')
}

/** Seconds since the process started, as the ladder shows them. */
export function formatOffset(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(2)} s`
}

/** A running clock: 0:07, 1:24. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function formatSeconds(ms: number): string {
  const s = Math.max(0, ms) / 1000
  return s < 10 ? `${s.toFixed(1)} s` : s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`
}

/** A date-only ISO string as "3 Jun 2026", read in UTC so it never shifts a day. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function formatStarted(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
