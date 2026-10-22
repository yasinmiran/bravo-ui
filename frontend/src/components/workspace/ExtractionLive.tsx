import { CheckIcon, ChevronDownIcon, CircleDashedIcon, CircleIcon, InfoIcon, LoaderCircleIcon, XIcon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'

import { EXTRACTION_STAGES, formatDuration, formatTime, useJobEvents, type StageEvent } from '@/api'
import { cn } from '@/lib/utils'

import { count, seconds } from './format'

type StageId = (typeof EXTRACTION_STAGES)[number]['id']
type StageState = 'done' | 'current' | 'failed' | 'todo'

const ORDER: StageId[] = EXTRACTION_STAGES.map((s) => s.id)
const LABEL: Record<string, string> = Object.fromEntries(EXTRACTION_STAGES.map((s) => [s.id, s.label]))
const STATE_WORD: Record<StageState, string> = { done: 'done', current: 'in progress', failed: 'failed', todo: 'not reached' }
const EASE = [0.2, 0, 0, 1] as const

const isStage = (id: string): id is StageId => (ORDER as string[]).includes(id)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])
const n = (v: number | null) => (v === null ? '' : v.toLocaleString())

/**
 * Where each stage stands. A new model attempt reopens everything after the model call,
 * because a validation or coverage retry loops back to it.
 */
function stageStates(events: StageEvent[], over: boolean): Record<StageId, StageState> {
  const state = Object.fromEntries(ORDER.map((id) => [id, 'todo'])) as Record<StageId, StageState>
  for (const e of events) {
    if (!isStage(e.stage)) continue
    if (e.stage === 'model' && e.status === 'start') for (const later of ORDER.slice(ORDER.indexOf('model') + 1)) state[later] = 'todo'
    if (e.status === 'start') state[e.stage] = 'current'
    else if (e.status === 'done') state[e.stage] = 'done'
    else if (e.status === 'fail') state[e.stage] = 'failed'
  }
  if (over) {
    for (const id of ORDER) if (state[id] === 'current') state[id] = 'todo'
    return state
  }
  if (!ORDER.some((id) => state[id] === 'current')) {
    const last = events.at(-1)
    const from = last && isStage(last.stage) ? ORDER.indexOf(last.stage) : -1
    const next = last?.detail.retry ? 'model' : ORDER.find((id, i) => i > from && state[id] === 'todo')
    if (next) state[next] = 'current'
  }
  return state
}

/** The live story of one rules extraction: a stage track, then a log with one line per event. */
export function ExtractionLive({ jobId }: { jobId: string }) {
  const { events, finished } = useJobEvents(jobId)
  const reduced = useReducedMotion()
  const over = finished || events.some((e) => e.stage === 'draft')
  const states = stageStates(events, over)
  const t0 = events.length ? Date.parse(events[0].ts) : 0
  const last = events.at(-1)
  const liveModel = states.model === 'current' ? events.findLast((e) => e.stage === 'model' && e.status === 'start')?.id : undefined
  const ready = events.length > 0 || finished
  const [toggled, setToggled] = useState<Record<number, boolean>>({})

  return (
    <div className="grid gap-4">
      <ol aria-label="Extraction stages" className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-6">
        {EXTRACTION_STAGES.map((s) => (
          <StageCell key={s.id} label={s.label} state={states[s.id]} pulse={!reduced} />
        ))}
      </ol>

      <p className="sr-only" role="status">
        {last?.title}
      </p>

      {ready && (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-1.5 font-mono text-xs text-muted-foreground">
            <span>{count(events.length, 'event')}</span>
            <span className="flex items-center gap-1.5 tabular-nums">
              {over ? (
                last && `finished at ${seconds(Date.parse(last.ts) - t0)}`
              ) : (
                <>
                  <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
                  live
                </>
              )}
            </span>
          </div>
          {events.length === 0 ? (
            <p className="px-3 py-3 font-mono text-xs text-muted-foreground">No events were recorded for this extraction.</p>
          ) : (
            <ol className="divide-y divide-border font-mono text-xs leading-5">
              <AnimatePresence initial={false}>
                {events.map((e) => (
                  <motion.li
                    key={e.id}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: EASE }}
                  >
                    <LogRow
                      event={e}
                      offset={Date.parse(e.ts) - t0}
                      live={e.id === liveModel}
                      open={toggled[e.id] ?? e.status === 'fail'}
                      onToggle={() => setToggled((t) => ({ ...t, [e.id]: !(t[e.id] ?? e.status === 'fail') }))}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

function StageCell({ label, state, pulse }: { label: string; state: StageState; pulse: boolean }) {
  return (
    <li className="grid gap-1.5" aria-current={state === 'current' ? 'step' : undefined}>
      <span className={cn('block h-1 overflow-hidden rounded-full', state === 'done' ? 'bg-foreground' : state === 'current' ? 'bg-accent' : 'bg-border')}>
        {state === 'current' && (
          <motion.span
            className="block h-full rounded-full bg-primary"
            animate={pulse ? { opacity: [1, 0.3, 1] } : undefined}
            transition={pulse ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : undefined}
          />
        )}
      </span>
      <span
        className={cn(
          'flex items-center gap-1.5 text-sm',
          state === 'todo' && 'text-muted-foreground',
          state === 'done' && 'text-foreground',
          state === 'current' && 'font-semibold text-foreground',
          state === 'failed' && 'font-medium text-destructive',
        )}
      >
        {state === 'done' && <CheckIcon className="size-3.5 shrink-0" />}
        {state === 'current' && <span className="size-2 shrink-0 rounded-full bg-primary" />}
        {state === 'failed' && <XIcon className="size-3.5 shrink-0" />}
        {state === 'todo' && <CircleDashedIcon className="size-3.5 shrink-0" />}
        {label}
        <span className="sr-only">, {STATE_WORD[state]}</span>
      </span>
    </li>
  )
}

const COLS = 'grid-cols-[3.5rem_1rem_5.5rem_minmax(0,1fr)_auto]'

/** One line: relative time, status, stage, what happened, and the numbers that matter. Click for the rest. */
function LogRow({ event: e, offset, live, open, onToggle }: { event: StageEvent; offset: number; live: boolean; open: boolean; onToggle: () => void }) {
  const detail = details(e)
  const fail = e.status === 'fail'
  const passedCheck = e.status === 'done' && (e.stage === 'validate' || e.stage === 'coverage')
  const icon = fail ? (
    <XIcon className="size-3.5 text-destructive" />
  ) : e.status === 'start' ? (
    live ? (
      <LoaderCircleIcon className="size-3.5 animate-spin text-foreground" />
    ) : (
      <CircleIcon className="size-2 fill-current text-muted-foreground" />
    )
  ) : e.status === 'info' ? (
    <InfoIcon className="size-3.5 text-muted-foreground" />
  ) : (
    <CheckIcon className={cn('size-3.5', passedCheck ? 'text-ok' : 'text-muted-foreground')} />
  )

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        disabled={!detail}
        aria-expanded={detail ? open : undefined}
        className={cn(
          'grid w-full items-start gap-x-3 px-3 py-1.5 text-left transition-colors focus-visible:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
          COLS,
          detail ? 'hover:bg-muted/60' : 'cursor-default',
        )}
      >
        <time dateTime={e.ts} title={formatTime(e.ts)} className="text-muted-foreground tabular-nums">
          {seconds(offset)}
        </time>
        <span className="flex h-5 items-center">{icon}</span>
        <span className="truncate text-muted-foreground">{LABEL[e.stage] ?? e.stage}</span>
        <span className={cn('min-w-0', fail ? 'text-destructive' : 'text-foreground')}>
          {e.title}
          {live && <span className="sr-only">, running</span>}
        </span>
        <span className="flex items-center gap-2 text-muted-foreground tabular-nums">
          {live ? <Elapsed since={e.ts} /> : meta(e)}
          {detail && <ChevronDownIcon className={cn('size-3.5 transition-transform duration-200', open && 'rotate-180')} />}
        </span>
      </button>
      {detail && open && (
        <div className={cn('grid gap-x-3 border-t border-dashed border-border bg-muted/30 px-3 py-2', COLS)}>
          <dl className="col-start-4 col-end-6 grid gap-x-4 gap-y-1 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
            {detail.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className={cn('min-w-0 break-words whitespace-pre-wrap', fail && k === 'error' && 'text-destructive')}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  )
}

/** The one or two numbers worth seeing without opening the row. */
function meta(e: StageEvent): string {
  const d = e.detail
  const ms = num(d.ms)
  const usage = d.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } | undefined
  const tokens = usage ? `${n(usage.input_tokens ?? 0)} in, ${n(usage.output_tokens ?? 0)} out` : ''
  switch (e.stage) {
    case 'intake':
      return d.fake_model === true ? 'fake model' : String(d.model ?? '')
    case 'schema':
      return `${strings(d.required_keys).length} keys`
    case 'model':
      if (e.status === 'start') return [num(d.attempt) !== null && `attempt ${num(d.attempt)}`, d.stream ? 'streaming' : ''].filter(Boolean).join(', ')
      if (e.status === 'fail') return `attempt ${num(d.attempt) ?? ''}`.trim()
      return [ms !== null && formatDuration(ms), tokens, d.cached ? 'cached' : ''].filter(Boolean).join(', ')
    case 'validate':
      if (e.status === 'fail') return d.retry ? 'retry' : ''
      return `${n(num(d.sections))} sections, ${n(num(d.vocabulary))} strings`
    case 'coverage': {
      const errors = strings(d.errors).length
      const warnings = strings(d.warnings).length
      return [errors && count(errors, 'gap'), warnings && count(warnings, 'note'), d.retry ? 'retry' : ''].filter(Boolean).join(', ')
    }
    case 'draft':
      return [num(d.attempts) !== null && count(num(d.attempts)!, 'attempt'), ms !== null && formatDuration(ms)].filter(Boolean).join(', ')
    default:
      return ''
  }
}

type Detail = [string, ReactNode][]

/** Everything else an event carries, as key and value lines. Null when a line says it all. */
function details(e: StageEvent): Detail | null {
  const d = e.detail
  const rows: Detail = []
  const put = (k: string, v: ReactNode) => {
    if (v !== '' && v !== null && v !== undefined && v !== false) rows.push([k, v])
  }
  const list = (v: unknown) => strings(v).join(', ')
  const usage = d.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } | undefined
  switch (e.stage) {
    case 'intake':
      put('document', [num(d.chars) !== null && `${n(num(d.chars))} characters`, num(d.lines) !== null && `${n(num(d.lines))} lines`].filter(Boolean).join(', '))
      put('sections', list(d.sections))
      put(count(strings(d.equipment_types).length, 'equipment type'), list(d.equipment_types))
      put(count(strings(d.redundancy_values).length, 'redundancy string'), list(d.redundancy_values))
      put('model', d.fake_model === true ? `${String(d.model ?? '')}, replaced by the fake model: the reply is generated locally, no API call` : String(d.model ?? ''))
      break
    case 'schema':
      put('required keys', list(d.required_keys))
      put('system prompt', num(d.system_chars) !== null && `${n(num(d.system_chars))} characters`)
      put('user prompt', num(d.user_chars) !== null && `${n(num(d.user_chars))} characters`)
      put('closes over', `by_equipment_type accepts only the ${count(strings(d.equipment_types).length, 'equipment type')}, redundancy_vocabulary only the ${count(strings(d.redundancy_values).length, 'redundancy string')}; the coverage check sends a draft back if one is missing`)
      break
    case 'model':
      put('model', String(d.model ?? ''))
      put('attempt', num(d.attempt))
      put('messages', num(d.messages) !== null && `${num(d.messages)} in the conversation`)
      put('max tokens', n(num(d.max_tokens)))
      put('took', num(d.ms) !== null && formatDuration(num(d.ms)))
      put(
        'tokens',
        usage && `${n(usage.input_tokens ?? 0)} in, ${n(usage.output_tokens ?? 0)} out${usage.cache_read_input_tokens ? `, ${n(usage.cache_read_input_tokens)} read from cache` : ''}`,
      )
      put('reply', num(d.chars) !== null && `${n(num(d.chars))} characters${d.cached ? ', served from the local cache' : ''}`)
      put('error', d.error ? String(d.error) : '')
      break
    case 'validate':
      if (e.status === 'fail') {
        put('errors', (Array.isArray(d.errors) ? d.errors.join('\n') : String(d.errors ?? '')).split('; ').join('\n'))
        put('next', d.retry ? 'asked the model for a corrected file' : '')
      } else {
        put('protection layer types', list(d.protection_layer_types))
        put('evacuation types', list(d.evacuation_types))
      }
      break
    case 'coverage':
      strings(d.errors).forEach((m) => put('gap', m))
      strings(d.warnings).forEach((m) => put('note', m))
      put('next', d.retry ? 'asked the model to close the gaps' : '')
      break
    case 'draft':
      put('issues', num(d.issues) !== null && count(num(d.issues)!, 'issue'))
      put('attempts', num(d.attempts))
      put('took', num(d.ms) !== null && formatDuration(num(d.ms)))
      put('tokens', usage && `${n(usage.input_tokens ?? 0)} in, ${n(usage.output_tokens ?? 0)} out`)
      put('error', d.error ? String(d.error) : '')
      break
  }
  return rows.length ? rows : null
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [])
  return <span>{(Math.max(0, now - Date.parse(since)) / 1000).toFixed(1)} s</span>
}
