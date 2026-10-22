import { CheckIcon, InfoIcon, XIcon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

import { EXTRACTION_STAGES, formatTime, useJobEvents, type EventStatus } from '@/api'
import { Spin } from '@/components/marks'
import { cn } from '@/lib/utils'

import { foldEvents, rowTitle, seconds, stageLabel, stageStates, type StageState } from './extraction'

const EASE = [0.2, 0, 0, 1] as const
const STATE_WORD: Record<StageState, string> = { done: 'done', running: 'running', failed: 'failed', waiting: 'not reached' }

function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(timer)
  }, [ticking])
  return now
}

function StageDot({ state, n }: { state: StageState; n: number }) {
  const base = 'relative z-10 grid size-6 place-items-center rounded-full text-xs font-bold'
  if (state === 'done')
    return (
      <span className={cn(base, 'bg-foreground text-background')}>
        <CheckIcon aria-hidden className="size-3.5" />
      </span>
    )
  if (state === 'running')
    return (
      <span className={cn(base, 'border-2 border-foreground bg-card text-foreground')}>
        <Spin className="size-3.5" />
      </span>
    )
  if (state === 'failed')
    return (
      <span className={cn(base, 'border-2 border-destructive bg-card text-destructive')}>
        <XIcon aria-hidden className="size-3.5" />
      </span>
    )
  return <span className={cn(base, 'border border-dashed border-input bg-card text-muted-foreground')}>{n}</span>
}

function RowIcon({ status, stage }: { status: EventStatus; stage: string }) {
  if (status === 'start') return <Spin className="mt-0.5 text-foreground" />
  if (status === 'fail') return <XIcon aria-hidden className="mt-0.5 size-3.5 text-destructive" />
  if (status === 'info') return <InfoIcon aria-hidden className="mt-0.5 size-3.5 text-muted-foreground" />
  const passedCheck = stage === 'validate' || stage === 'coverage'
  return <CheckIcon aria-hidden className={cn('mt-0.5 size-3.5', passedCheck ? 'text-ok' : 'text-foreground')} />
}

/** A compact live view of one extraction: the six stages as a track, then the events as they land. */
export function ExtractionLive({ jobId, startedAt, onFinished }: { jobId: string; startedAt: string; onFinished: () => void }) {
  const { events, finished } = useJobEvents(jobId)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (finished) onFinished()
  }, [finished, onFinished])

  const states = stageStates(events)
  const rows = foldEvents(events)
  const now = useNow(rows.some((r) => r.status === 'start'))
  const t0 = events.length ? Date.parse(events[0].ts) : Date.parse(startedAt)

  return (
    <div className="grid gap-5">
      <ol aria-label="Extraction stages" className="grid max-w-[40rem] grid-cols-6">
        {EXTRACTION_STAGES.map((s, i) => {
          const state = states[s.id]
          return (
            <li key={s.id} className="relative flex flex-col items-center gap-1.5 text-center">
              {i < EXTRACTION_STAGES.length - 1 && (
                <span
                  aria-hidden
                  className={cn('absolute top-3 right-[calc(-50%+0.75rem)] left-[calc(50%+0.75rem)] h-px', state === 'done' ? 'bg-foreground' : 'bg-border')}
                />
              )}
              <StageDot state={state} n={i + 1} />
              <span className={cn('text-xs leading-tight', state === 'waiting' ? 'text-muted-foreground' : 'font-medium text-foreground', state === 'failed' && 'text-destructive')}>
                {s.label}
                <span className="sr-only">, {STATE_WORD[state]}</span>
              </span>
            </li>
          )
        })}
      </ol>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">Started {formatTime(startedAt)}</p>
        <ol aria-live="polite" className="grid">
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <motion.li
                key={row.key}
                layout={reduce ? false : 'position'}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0.12 : 0.2, ease: EASE }}
                className="grid grid-cols-[3.75rem_1rem_minmax(0,1fr)] gap-x-2 border-t border-border py-1.5 text-sm first:border-t-0"
              >
                <span className="pt-px text-right text-xs text-muted-foreground tabular-nums">{seconds(Date.parse(row.startedAt) - t0)}</span>
                <RowIcon status={row.status} stage={row.stage} />
                <div className="min-w-0">
                  <span className="text-muted-foreground">{stageLabel(row.stage)}</span>{' '}
                  <span className={cn('font-bold', row.status === 'fail' && 'text-destructive')}>{rowTitle(row)}</span>
                  {row.status === 'start' && <span className="ml-2 text-muted-foreground tabular-nums">{seconds(now - Date.parse(row.startedAt))}</span>}
                  {row.errors && <pre className="mt-1 line-clamp-4 font-mono text-xs whitespace-pre-wrap text-muted-foreground">{row.errors}</pre>}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        {!events.length && <p className="text-sm text-muted-foreground">Waiting for the first event.</p>}
      </div>
    </div>
  )
}
