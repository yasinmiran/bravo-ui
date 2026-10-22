import { CheckIcon, CircleDashedIcon, InfoIcon, XIcon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type ChipTone = 'ink' | 'muted' | 'ok' | 'danger' | 'info' | 'running'

const TONE: Record<ChipTone, string> = {
  ink: 'text-foreground',
  running: 'text-foreground',
  muted: 'border-dashed font-medium text-muted-foreground',
  ok: 'text-ok',
  danger: 'text-destructive',
  info: 'font-medium text-muted-foreground',
}

const TONE_ICON: Record<ChipTone, ReactNode> = {
  ink: <CheckIcon className="size-3.5" />,
  running: <PulseDot />,
  muted: <CircleDashedIcon className="size-3.5" />,
  ok: <CheckIcon className="size-3.5" />,
  danger: <XIcon className="size-3.5" />,
  info: <InfoIcon className="size-3.5" />,
}

/** Outline status chip: icon then word, never filled, so nothing competes with a band. */
export function StateChip({ tone, children, className }: { tone: ChipTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-sm border border-input bg-card pr-2 pl-1.5 text-xs font-bold',
        TONE[tone],
        className,
      )}
    >
      {TONE_ICON[tone]}
      {children}
    </span>
  )
}

/** A small dot that breathes while work is in flight; still under reduced motion. */
export function PulseDot({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  return (
    <span className={cn('relative inline-grid size-3.5 place-items-center', className)} aria-hidden>
      {!reduce && (
        <motion.span
          className="absolute inset-0.5 rounded-full bg-foreground"
          animate={{ scale: [0.6, 1.4], opacity: [0.5, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span className="size-1.5 rounded-full bg-foreground" />
    </span>
  )
}

/** A numeral that rolls when it changes: the old one leaves upward, the new one enters from below. */
export function Ticker({ value, className }: { value: string | number; className?: string }) {
  const reduce = useReducedMotion()
  if (reduce) return <span className={cn('tabular-nums', className)}>{value}</span>
  return (
    <span className={cn('relative inline-flex overflow-hidden tabular-nums', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          initial={{ y: '40%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-40%', opacity: 0 }}
          transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/** Label and value pairs on one wrapping line. */
export function Kv({ items, className }: { items: [string, ReactNode][]; className?: string }) {
  return (
    <dl className={cn('flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground', className)}>
      {items.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-1.5">
          <dt>{k}</dt>
          <dd className="font-bold text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A literal string from a file, such as a redundancy value. */
export function Literal({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cn('rounded-sm bg-muted px-1 py-0.5 font-mono text-xs text-foreground', className)}>{children}</code>
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('mb-3 flex items-center gap-1.5 text-sm font-bold text-muted-foreground', className)}>{children}</h3>
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-sm border border-b-2 border-input px-1 text-xs font-bold text-muted-foreground">
      {children}
    </kbd>
  )
}
