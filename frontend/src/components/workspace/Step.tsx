import { LockIcon, XIcon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { outline } from './styles'

export type StepState = 'done' | 'current' | 'locked' | 'stale'

const EASE = [0.2, 0, 0, 1] as const

const NUMBER: Record<StepState, string> = {
  done: 'border-foreground bg-foreground text-background',
  current: 'border-foreground bg-background text-foreground ring-[1.5px] ring-foreground ring-offset-2 ring-offset-background',
  locked: 'border-dashed border-input bg-background text-muted-foreground',
  stale: 'border-destructive bg-background text-destructive ring-[1.5px] ring-destructive ring-offset-2 ring-offset-background',
}

interface StepProps {
  id: string
  n: number
  title: string
  state: StepState
  open: boolean
  /** One line for a collapsed, done step. */
  summary: ReactNode
  /** What the step is for, shown while it is open. */
  description: ReactNode
  /** What unlocks a locked step. */
  lockedReason: string
  /** Change or Close, offered on done steps. */
  onToggle?: () => void
  /** Draws the rail down to the next step, dashed when that step is locked. */
  next?: StepState
  children: ReactNode
}

export function Step({ id, n, title, state, open, summary, description, lockedReason, onToggle, next, children }: StepProps) {
  const reduced = useReducedMotion()
  const locked = state === 'locked'
  const bodyId = `${id}-body`

  return (
    <section aria-labelledby={`${id}-title`} className={cn('relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 sm:gap-x-4', next && 'pb-8')}>
      {next && (
        <span
          aria-hidden
          className={cn(
            'absolute top-9 bottom-1 left-[0.875rem] hidden -translate-x-1/2 sm:block',
            next === 'locked' ? 'border-l border-dashed border-input' : 'w-px bg-border',
          )}
        />
      )}
      <span
        aria-hidden
        className={cn('relative mt-0.5 inline-flex size-7 items-center justify-center rounded-full border-[1.5px] text-xs font-bold tabular-nums', NUMBER[state])}
      >
        {n}
      </span>

      <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id={`${id}-title`} className={cn('flex flex-wrap items-center gap-x-3 text-md leading-8 font-bold', locked && 'text-muted-foreground')}>
            <span>
              <span className="sr-only">Step {n}, </span>
              {title}
            </span>
            {state === 'stale' && (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-destructive">
                <XIcon className="size-3.5" />
                Out of date
              </span>
            )}
          </h2>
          {locked ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <LockIcon className="size-3.5 shrink-0" />
              {lockedReason}
            </p>
          ) : (
            (state === 'current' || !summary ? (
              <p className="max-w-[72ch] text-sm text-muted-foreground">{description}</p>
            ) : (
              !open && <p className="max-w-[72ch] text-sm text-muted-foreground">{summary}</p>
            ))
          )}
        </div>
        {state === 'done' && onToggle && (
          <Button variant="outline" className={outline} onClick={onToggle} aria-expanded={open} aria-controls={bodyId}>
            {open ? 'Close' : 'Change'}
          </Button>
        )}
      </header>

      <AnimatePresence initial={false}>
        {open && !locked && (
          <motion.div
            key="body"
            id={bodyId}
            initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
            animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
            exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
            transition={{ duration: reduced ? 0 : 0.2, ease: EASE }}
            className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2"
          >
            <div className="pt-4 pb-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
