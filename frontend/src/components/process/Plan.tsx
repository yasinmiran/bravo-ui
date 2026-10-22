import { CheckIcon, ChevronDownIcon, LoaderCircleIcon, XIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { BANDS, bandLabel, type ProcessDetail, type StageEvent, type Usage } from '@/api'
import { BandChip, Note } from '@/components/marks'
import { cn } from '@/lib/utils'

import { Kv } from './bits'
import { formatOffset, formatSeconds, formatTokens, list, noteKind, notesSummary, num, plural, stageCounts, stageIndex, str, type Lane } from './derive'

export type PlanState = 'done' | 'active' | 'partial' | 'pending' | 'failed'

export interface PlanRow {
  id: string
  label: string
  state: PlanState
  /** What is happening or happened, in one short clause. */
  message: string
  /** The right-hand column: findings in flight, or the moment a batch stage landed. */
  aside: string
  detail?: ReactNode
}

const inFlight = (ids: string[]) => (ids.length ? `${ids.slice(0, 3).join(', ')}${ids.length > 3 ? ` +${ids.length - 3}` : ''}` : '')
const firstLine = (s: string | null | undefined) => (s ?? '').split('\n')[0]

/** Ten rows from the lanes and the batch events. Counts come from lane positions, so a retry never counts twice. */
function planRows(process: ProcessDetail, lanes: Lane[], events: StageEvent[]): PlanRow[] {
  const total = lanes.length
  const counts = stageCounts(lanes)
  const running = process.status === 'running'
  const t0 = events.length ? Date.parse(events[0].ts) : Date.parse(process.started_at)
  const at = (e: StageEvent | undefined) => (e ? formatOffset(Date.parse(e.ts) - t0) : '')
  const batch = (stage: string) => events.find((e) => !e.finding_id && e.stage === stage)
  const intake = batch('intake')
  const start = batch('start')
  const finish = batch('finish')
  const notes = notesSummary(events)
  const laneState = (i: number): PlanState => {
    const c = counts[i]
    if (total > 0 && c.passed === total) return 'done'
    if (c.now.length) return 'active'
    return c.passed > 0 ? 'partial' : 'pending'
  }
  const of = (i: number, word: string) => `${counts[i].passed} of ${total} ${word}`

  const corrected = events.filter((e) => e.stage === 'validate' && e.status === 'fail').length
  const reconsidered = events.filter((e) => e.stage === 'invariants' && e.status === 'fail' && e.detail.retry === true).length
  const retried = lanes.filter((l) => l.attempts > 1).length
  const failed = lanes.filter((l) => l.phase === 'failed').length
  const flagged = events.filter((e) => e.stage === 'review' && e.status === 'done' && list(e.detail.reasons).length > 0).length
  const tally: Record<string, number> = {}
  for (const e of events) if (e.stage === 'urgency' && e.status === 'done' && str(e.detail.band)) tally[str(e.detail.band)!] = (tally[str(e.detail.band)!] ?? 0) + 1
  const bandsSoFar = BANDS.filter((b) => tally[b.name])
    .map((b) => `${bandLabel(b.name).toLowerCase()} ${tally[b.name]}`)
    .join(', ')

  const NOTES = stageIndex('notes')
  const PROMPT = stageIndex('prompt')
  const MODEL = stageIndex('model')
  const VALIDATE = stageIndex('validate')
  const INVARIANTS = stageIndex('invariants')
  const URGENCY = stageIndex('urgency')
  const REVIEW = stageIndex('review')
  const TICKET = stageIndex('ticket')

  const rows: PlanRow[] = []

  rows.push({
    id: 'intake',
    label: 'Intake',
    state: intake ? 'done' : running ? 'active' : 'pending',
    message: intake ? intake.title : 'Joining the findings to the assets',
    aside: at(intake),
    detail: intake && <IntakeDetail event={intake} />,
  })

  rows.push({
    id: 'notes',
    label: 'Batch notes',
    state: laneState(NOTES) === 'partial' ? 'active' : laneState(NOTES),
    message: notes.findings ? `${plural(notes.notes, 'note')} on ${plural(notes.findings, 'finding')}` : intake ? 'Looking for siblings, partners and voted groups' : 'What one finding alone would hide',
    aside: at(events.find((e) => !!e.finding_id && e.stage === 'notes')),
    detail: notes.notes > 0 && (
      <Kv
        items={Object.entries(notes.kinds)
          .sort((a, b) => b[1] - a[1])
          .map(([kind, n]) => [noteKind(kind), String(n)])}
      />
    ),
  })

  rows.push({
    id: 'prompt',
    label: 'Making prompts',
    state: laneState(PROMPT),
    message: counts[PROMPT].passed ? of(PROMPT, 'rendered') : 'The rules for each equipment type, the finding and its notes',
    aside: inFlight(counts[PROMPT].now),
  })

  rows.push({
    id: 'model',
    label: 'Calling the model',
    state: laneState(MODEL),
    message: counts[MODEL].passed || counts[MODEL].now.length ? `${of(MODEL, 'replies')}${retried ? `, ${retried} retried` : ''}` : start ? start.title : 'One structured call per finding',
    aside: inFlight(counts[MODEL].now),
    detail: start && (
      <Kv
        items={[
          ['Model', str(start.detail.model) ?? '?'],
          ['Workers', String(num(start.detail.workers) ?? '?')],
          ['Cache', start.detail.cache ? 'On' : start.detail.fake_model ? 'Off, fake model' : 'Off'],
          ['Max tokens', formatTokens(16000)],
        ]}
      />
    ),
  })

  rows.push({
    id: 'validate',
    label: 'Validating replies',
    state: laneState(VALIDATE),
    message: counts[VALIDATE].passed ? `${of(VALIDATE, 'pass')}${corrected ? `, ${corrected} corrected` : ''}` : 'Against the assessment schema',
    aside: inFlight(counts[VALIDATE].now),
  })

  rows.push({
    id: 'invariants',
    label: 'Checking invariants',
    state: laneState(INVARIANTS),
    message: counts[INVARIANTS].passed ? `${of(INVARIANTS, 'pass')}${reconsidered ? `, ${reconsidered} reconsidered` : ''}` : 'Four checks between the flags and the scores',
    aside: inFlight(counts[INVARIANTS].now),
  })

  rows.push({
    id: 'urgency',
    label: 'Ranking urgency',
    state: laneState(URGENCY),
    message: counts[URGENCY].passed ? `${of(URGENCY, 'ranked')}${bandsSoFar ? `: ${bandsSoFar}` : ''}` : 'From likelihood and impact, by the rules, never by the model',
    aside: inFlight(counts[URGENCY].now),
  })

  rows.push({
    id: 'review',
    label: 'Review triggers',
    state: laneState(REVIEW),
    message: counts[REVIEW].passed ? `${flagged} of ${counts[REVIEW].passed} need an engineer first` : 'Safety critical elements, confirmed failures, low confidence',
    aside: inFlight(counts[REVIEW].now),
  })

  rows.push({
    id: 'ticket',
    label: 'Drafting tickets',
    state: laneState(TICKET),
    message: counts[TICKET].passed ? `${of(TICKET, 'drafted')}${failed ? `, ${failed} failed` : ''}` : 'One ticket per finding, with its whole trace',
    aside: inFlight(counts[TICKET].now),
  })

  const allThrough = total > 0 && counts[TICKET].passed === total
  rows.push({
    id: 'finish',
    label: 'Done',
    state: finish ? (finish.status === 'fail' ? 'failed' : 'done') : process.status === 'failed' ? 'failed' : allThrough ? 'active' : 'pending',
    message: finish ? finish.title : process.status === 'failed' ? firstLine(process.error) || 'The process failed' : allThrough ? 'Writing the summary' : 'Tickets go to the review queue',
    aside: at(finish),
    detail: finish && <FinishDetail event={finish} />,
  })

  return rows
}

function IntakeDetail({ event }: { event: StageEvent }) {
  const mismatches = list<{ finding_id: string; finding_type: string; asset_type: string }>(event.detail.type_mismatches)
  return (
    <>
      <Kv
        items={[
          ['Findings', String(num(event.detail.findings) ?? '?')],
          ['Assets', String(num(event.detail.assets) ?? '?')],
          ['Equipment with findings', String(num(event.detail.equipment_with_findings) ?? '?')],
          ['Type mismatches', String(mismatches.length)],
        ]}
      />
      {mismatches.map((m) => (
        <Note key={m.finding_id} className="mt-1">
          {m.finding_id}: the file says {m.finding_type}, the assets say {m.asset_type}. The asset type is used.
        </Note>
      ))}
    </>
  )
}

function FinishDetail({ event }: { event: StageEvent }) {
  if (event.status === 'fail') return <p className="text-destructive">{str(event.detail.error)}</p>
  const usage = (event.detail.usage ?? {}) as Partial<Usage>
  const bands = (event.detail.bands ?? {}) as Record<string, number>
  return (
    <div className="grid gap-2">
      <Kv
        items={[
          ['Tickets', String(num(event.detail.tickets) ?? '?')],
          ['Failed', String(num(event.detail.failed) ?? 0)],
          ['Review required', String(num(event.detail.review_required) ?? '?')],
          ['Tokens', `${formatTokens(usage.input_tokens)} in, ${formatTokens(usage.output_tokens)} out`],
          ['Took', formatSeconds(num(event.detail.ms) ?? 0)],
        ]}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {BANDS.filter((b) => bands[b.name]).map((b) => (
          <BandChip key={b.name} band={b.name} count={bands[b.name]} />
        ))}
      </div>
    </div>
  )
}

function Mark({ state }: { state: PlanState }) {
  const base = 'relative z-10 grid size-5 place-items-center rounded-full'
  switch (state) {
    case 'done':
      return (
        <span className={cn(base, 'bg-foreground text-background')}>
          <CheckIcon className="size-3" strokeWidth={3} />
        </span>
      )
    case 'active':
      return (
        <span className={cn(base, 'bg-card text-foreground')}>
          <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
        </span>
      )
    case 'partial':
      return (
        <span className={cn(base, 'border-[1.5px] border-foreground bg-card')}>
          <span className="size-1.5 rounded-full bg-foreground" />
        </span>
      )
    case 'failed':
      return (
        <span className={cn(base, 'bg-destructive text-white')}>
          <XIcon className="size-3" strokeWidth={3} />
        </span>
      )
    default:
      return <span className={cn(base, 'border-[1.5px] border-dashed border-input bg-card')} />
  }
}

const STATE_WORD: Record<PlanState, string> = { done: 'done', active: 'in progress', partial: 'partly done', pending: 'not reached', failed: 'failed' }

/**
 * The vertical plan: one row per stage, a rail down the left, the spinner where work is
 * happening right now. Rows with a detail open on click when `expandable` is set.
 */
export function ProcessPlan({
  process,
  lanes,
  events,
  expandable = false,
  layout = 'inline',
  className,
}: {
  process: ProcessDetail
  lanes: Lane[]
  events: StageEvent[]
  expandable?: boolean
  /** Inline puts the message beside the label; stacked puts it underneath, for a narrow column. */
  layout?: 'inline' | 'stacked'
  className?: string
}) {
  const rows = planRows(process, lanes, events)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return (
    <ol aria-label="Process stages" className={cn('grid', className)}>
      {rows.map((r, i) => {
        const canOpen = expandable && !!r.detail
        const isOpen = canOpen && !!open[r.id]
        const Row: 'button' | 'div' = canOpen ? 'button' : 'div'
        return (
          <li key={r.id} className="relative">
            {i < rows.length - 1 && (
              <span aria-hidden className={cn('absolute top-7 bottom-0 left-[0.625rem] w-px -translate-x-1/2', r.state === 'done' ? 'bg-foreground/40' : 'bg-border')} />
            )}
            <Row
              type={canOpen ? 'button' : undefined}
              aria-expanded={canOpen ? isOpen : undefined}
              onClick={canOpen ? () => setOpen((o) => ({ ...o, [r.id]: !o[r.id] })) : undefined}
              className={cn(
                'grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md py-1.5 text-left',
                canOpen && 'cursor-pointer transition-colors hover:bg-muted/60 focus-visible:bg-muted',
              )}
            >
              <span className="pt-px">
                <Mark state={r.state} />
              </span>
              <span className="min-w-0 text-sm leading-[1.375rem]">
                <span className={cn('font-medium', r.state === 'pending' ? 'text-muted-foreground' : 'text-foreground', r.state === 'failed' && 'text-destructive')}>
                  {r.label}
                </span>
                <span className="sr-only">, {STATE_WORD[r.state]}: </span>
                <span className={cn('text-muted-foreground', layout === 'stacked' ? 'block' : 'ml-2', r.state === 'failed' && 'text-destructive')}>{r.message}</span>
              </span>
              <span className="flex items-center gap-1.5 pt-px font-mono text-xs leading-5 text-muted-foreground tabular-nums">
                {r.aside}
                {canOpen && <ChevronDownIcon className={cn('size-3.5 transition-transform duration-200', isOpen && 'rotate-180')} />}
              </span>
            </Row>
            {isOpen && <div className="mb-2 ml-8 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{r.detail}</div>}
          </li>
        )
      })}
    </ol>
  )
}
