import { CheckIcon, CircleDashedIcon, CircleIcon, FlagIcon, InfoIcon, MinusIcon, XIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

import { bandLabel, type FiredOverride, type Gate, type InvariantCheck, type Rules, type Usage } from '@/api'
import { Ucell } from '@/components/marks'
import { cn } from '@/lib/utils'

import { Kv } from './bits'
import {
  bandOf,
  capitalize,
  entryTitle,
  formatChars,
  formatOffset,
  formatSeconds,
  formatTokens,
  ladderEntries,
  list,
  noteKind,
  num,
  splitReason,
  stageLabel,
  str,
  unreachedStages,
  urgencySteps,
  type Bands,
  type LadderEntry,
  type Lane,
} from './derive'
import { useNow } from './hooks'
import { UrgencySteps } from './Urgency'

export interface LadderContext {
  /** Epoch ms of the process's first event; every row shows its time since then. */
  t0: number
  /** Events at or below this id were already there when the page painted, so they do not animate in. */
  quietMax: number
  rules: Rules | null
  bands: Bands
  onOpenTicket: (ticketId: string) => void
}

type Mark = 'start' | 'done' | 'pass' | 'fail' | 'info' | 'pending'

const MARK_ICON: Record<Mark, ReactNode> = {
  start: <CircleIcon className="size-4 text-muted-foreground" />,
  done: <CheckIcon className="size-4 text-foreground" />,
  pass: <CheckIcon className="size-4 text-ok" />,
  fail: <XIcon className="size-4 text-destructive" />,
  info: <InfoIcon className="size-4 text-muted-foreground" />,
  pending: <CircleDashedIcon className="size-4 text-muted-foreground" />,
}

function markOf(entry: LadderEntry): Mark {
  if (entry.status === 'fail') return 'fail'
  if (entry.status === 'start') return 'start'
  if (entry.status === 'info') return 'info'
  if (entry.stage === 'validate' || entry.stage === 'invariants') return 'pass'
  if (entry.stage === 'notes' && list(entry.event.detail.notes).length) return 'info'
  return 'done'
}

const RAIL = 'left-[calc(5.5rem-0.5px)] @max-[60rem]:left-[calc(4.5rem-0.5px)]'

function LadderRow({
  time,
  mark,
  stage,
  title,
  animate,
  last,
  children,
}: {
  time: string
  mark: Mark
  stage: string
  title: string
  animate: boolean
  last: boolean
  children?: ReactNode
}) {
  const failWord = mark === 'fail' && !/fail/i.test(title)
  return (
    <motion.li
      initial={animate ? { opacity: 0, y: -4 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      className="relative grid grid-cols-[4.25rem_1.5rem_minmax(0,1fr)] gap-x-2 pb-3 text-sm @max-[60rem]:grid-cols-[3.25rem_1.5rem_minmax(0,1fr)]"
    >
      <span className="pt-px text-right font-mono text-xs text-muted-foreground tabular-nums">{time}</span>
      <span className="relative z-10 grid h-5 w-6 place-items-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={mark}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="grid place-items-center rounded-full bg-card"
          >
            {MARK_ICON[mark]}
          </motion.span>
        </AnimatePresence>
      </span>
      <div className="min-w-0">
        <p>
          <span className="mr-1.5 text-muted-foreground">{stageLabel(stage)}</span>
          {failWord && <span className="mr-1.5 font-medium text-destructive">failed</span>}
          <span className={cn('text-foreground', mark === 'fail' && 'font-medium text-destructive', mark === 'pending' && 'text-muted-foreground')}>{title}</span>
        </p>
        {children && <div className="mt-1 text-muted-foreground">{children}</div>}
      </div>
      {!last && (
        <span
          aria-hidden
          className={cn(
            'absolute top-[1.375rem] bottom-0 w-0',
            RAIL,
            mark === 'pending' ? 'border-l border-dashed border-input' : 'border-l border-input',
          )}
        />
      )}
    </motion.li>
  )
}

/** Every event of one finding in order, then the stages it has not reached. */
export function Ladder({ lane, ctx, sce }: { lane: Lane; ctx: LadderContext; sce: boolean | null }) {
  const entries = ladderEntries(lane.events)
  const unreached = unreachedStages(lane, entries)
  return (
    <ol>
      <AnimatePresence initial={false}>
        {entries.map((entry, i) => (
          <LadderRow
            key={entry.key}
            time={formatOffset(Date.parse(entry.ts) - ctx.t0)}
            mark={markOf(entry)}
            stage={entry.stage}
            title={entryTitle(entry)}
            animate={entry.key > ctx.quietMax}
            last={i === entries.length - 1 && unreached.length === 0}
          >
            <EntryDetail entry={entry} ctx={ctx} sce={sce} />
          </LadderRow>
        ))}
        {unreached.map((stage, i) => (
          <LadderRow
            key={`pending-${stage}`}
            time=""
            mark="pending"
            stage={stage}
            title={lane.phase === 'queued' && stage === 'prompt' ? 'Waiting for a worker' : 'Not reached'}
            animate={false}
            last={i === unreached.length - 1}
          />
        ))}
      </AnimatePresence>
    </ol>
  )
}

function EntryDetail({ entry, ctx, sce }: { entry: LadderEntry; ctx: LadderContext; sce: boolean | null }) {
  const e = entry.event
  const d = e.detail
  switch (entry.stage) {
    case 'notes':
      return <NotesList notes={list(d.notes)} />
    case 'prompt':
      if (e.stage !== 'prompt') return null
      return (
        <Kv
          items={[
            ['System', `${formatChars(num(d.system_chars))} characters`],
            ['User', `${formatChars(num(d.user_chars))} characters`],
            ['Rules section', str(d.section) ?? 'none'],
            ['Batch notes', String(num(d.notes) ?? 0)],
          ]}
        />
      )
    case 'model':
      return <ModelDetail entry={entry} />
    case 'validate': {
      if (e.status === 'fail') {
        const errors = Array.isArray(d.errors) ? d.errors.join('\n') : (str(d.errors) ?? '')
        return <ErrorBlock>{errors.replace(/; /g, '\n')}</ErrorBlock>
      }
      const scores = (d.scores ?? {}) as { likelihood?: number; impact?: number }
      return (
        <Kv
          items={[
            ['Likelihood', String(scores.likelihood ?? '?')],
            ['Impact', String(scores.impact ?? '?')],
          ]}
        />
      )
    }
    case 'invariants':
      return <Checks checks={list<InvariantCheck>(d.checks)} failed={e.status === 'fail'} retry={d.retry === true} />
    case 'urgency': {
      if (e.status !== 'done') {
        const violations = list<string>(d.violations)
        return violations.length ? <p>{violations.map(capitalize).join('. ')}.</p> : null
      }
      const score = num(d.score) ?? 0
      const steps = urgencySteps(
        { base: num(d.base) ?? 0, gates: list<Gate>(d.gates), overrides: list<FiredOverride>(d.overrides), score },
        { likelihood: num(d.likelihood) ?? 0, impact: num(d.impact) ?? 0 },
        sce,
        ctx.rules,
      )
      return (
        <div className="max-w-[68ch]">
          <UrgencySteps steps={steps} compact />
          <p className="mt-2 flex items-center gap-2 font-bold text-foreground">
            <Ucell score={score} band={str(d.band)} className="size-7 text-sm" />
            {bandLabel(str(d.band))}
          </p>
        </div>
      )
    }
    case 'review':
      return <Reasons reasons={list<string>(d.reasons)} />
    case 'ticket': {
      const ticketId = str(d.ticket_id)
      const failed = e.status === 'fail'
      return (
        <div className="grid gap-1">
          {failed ? (
            <p>Scored 10, 10, 10 so it sorts to the top of the today band. Every attempt and its error travel with the ticket.</p>
          ) : (
            <Kv
              items={[
                ['Review', d.review_required ? 'Required' : 'Not required'],
                ['Band', bandLabel(str(d.band) ?? bandOf(num(d.urgency), ctx.bands))],
              ]}
            />
          )}
          {ticketId && (
            <button
              type="button"
              onClick={() => ctx.onOpenTicket(ticketId)}
              className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open {ticketId} in Tickets
            </button>
          )}
        </div>
      )
    }
    default:
      return null
  }
}

function ModelDetail({ entry }: { entry: LadderEntry }) {
  const open = entry.status === 'start'
  const now = useNow(open, 100)
  const start = (entry.start ?? entry.event).detail
  const end = open ? null : entry.event.detail
  const usage = end?.usage as Usage | undefined
  const items: [string, ReactNode][] = [
    ['Model', str(start.model) ?? 'unknown'],
    ['Attempt', String(num(start.attempt) ?? 1)],
    ['Max tokens', formatTokens(num(start.max_tokens))],
  ]
  if (open) items.push(['Elapsed', formatSeconds(now - Date.parse(entry.ts))])
  if (end) {
    items.push(['Elapsed', `${formatTokens(num(end.ms))} ms`])
    if (usage) items.push(['Input', formatTokens(usage.input_tokens)], ['Output', formatTokens(usage.output_tokens)])
    if (entry.status === 'done') items.push(['Cached', end.cached ? 'Yes' : 'No'])
  }
  return (
    <>
      <Kv items={items} />
      {end && entry.status === 'fail' && str(end.error) && <ErrorBlock>{str(end.error)}</ErrorBlock>}
    </>
  )
}

function ErrorBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="mt-1 max-w-[72ch] overflow-x-auto rounded-sm bg-muted px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
      {children}
    </pre>
  )
}

export function NotesList({ notes, className }: { notes: { kind: string; text: string }[]; className?: string }) {
  if (!notes.length) return null
  return (
    <ul className={cn('grid max-w-[68ch] gap-2', className)}>
      {notes.map((n, i) => (
        <li key={i}>
          <b className="block font-bold text-foreground">{noteKind(n.kind)}</b>
          {n.text}
        </li>
      ))}
    </ul>
  )
}

function Checks({ checks, failed, retry }: { checks: InvariantCheck[]; failed: boolean; retry: boolean }) {
  return (
    <>
      <ul className="grid gap-1.5">
        {checks.map((c) => {
          const state = !c.applies ? 'na' : c.passed ? 'pass' : 'fail'
          return (
            <li key={c.id} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2">
              {state === 'na' ? (
                <MinusIcon className="mt-0.5 size-3.5 text-muted-foreground" />
              ) : state === 'pass' ? (
                <CheckIcon className="mt-0.5 size-3.5 text-ok" />
              ) : (
                <XIcon className="mt-0.5 size-3.5 text-destructive" />
              )}
              <span>
                <span className={cn('font-bold text-foreground', state === 'na' && 'font-medium text-muted-foreground', state === 'fail' && 'text-destructive')}>
                  {c.name}
                </span>{' '}
                <span className={cn(state === 'pass' && 'text-ok', state === 'fail' && 'font-medium text-destructive', state === 'na' && 'text-muted-foreground')}>
                  {state === 'na' ? 'Not applicable' : state === 'pass' ? 'Pass' : 'Fail'}
                </span>
                {state === 'fail' && <span className="block text-destructive">{capitalize(c.message)}.</span>}
              </span>
            </li>
          )
        })}
      </ul>
      {failed && (
        <p className="mt-1.5">
          {retry ? 'The retry sends these violations back to the model.' : 'Still failing after the retry, so the ticket goes to review.'}
        </p>
      )}
    </>
  )
}

export function Reasons({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return <p>None.</p>
  return (
    <ul className="grid gap-1">
      {reasons.map((r) => {
        const [lead, rest] = splitReason(r)
        return (
          <li key={r} className="flex gap-2">
            <FlagIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span>
              <b className="font-bold text-foreground">{lead}</b> {rest}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
