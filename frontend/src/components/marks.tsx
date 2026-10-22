import { CheckIcon, CircleDashedIcon, FlagIcon, InfoIcon, LoaderCircleIcon, LockIcon, OctagonXIcon, PencilIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { bandKey, bandLabel, type BandName, type Decision, type ProcessStatus, type RulesStatus } from '@/api'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Equipment and finding ids: bold, tabular figures, same family as the body. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('tag', className)}>{children}</span>
}

/** Safety Critical Element. The only filled neutral badge in the product. */
export function Sce({ className }: { className?: string }) {
  return (
    <span
      title="Safety Critical Element"
      className={cn('inline-flex h-5 items-center rounded-sm bg-foreground px-1.5 text-xs font-bold leading-none text-background', className)}
    >
      SCE
    </span>
  )
}

/** Urgency score in its band colour. 32px square by default. */
export function Ucell({ score, band, className }: { score: number | null | undefined; band: BandName | string | null | undefined; className?: string }) {
  return (
    <span
      title={bandLabel(band)}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-base font-extrabold tabular-nums',
        `band-${bandKey(band)}`,
        className,
      )}
    >
      {score ?? '-'}
      <span className="sr-only">, {bandLabel(band)}</span>
    </span>
  )
}

export function BandChip({ band, count, className }: { band: BandName; count?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <span className={cn('size-3 rounded-[2px]', `band-${bandKey(band)}`)} />
      <span>{bandLabel(band)}</span>
      {count != null && <span className="tabular-nums text-muted-foreground">{count}</span>}
    </span>
  )
}

/** A turning arc. Always put a word beside it; under reduced motion it is a static ring. */
export function Spin({ className }: { className?: string }) {
  return <LoaderCircleIcon aria-hidden className={cn('size-3.5 animate-spin motion-reduce:animate-none', className)} />
}

export type BadgeState = ProcessStatus | RulesStatus | 'queued' | 'drafted' | 'added' | 'locked' | 'stale' | 'info' | 'not_added'

const STATES: Record<BadgeState, { label: string; icon: ReactNode; className: string }> = {
  queued: { label: 'Queued', icon: <CircleDashedIcon />, className: 'border-dashed text-muted-foreground' },
  not_added: { label: 'Not added', icon: <CircleDashedIcon />, className: 'border-dashed text-muted-foreground' },
  locked: { label: 'Locked', icon: <LockIcon />, className: 'border-dashed text-muted-foreground' },
  running: { label: 'Running', icon: <Spin />, className: 'text-foreground' },
  extracting: { label: 'Extracting', icon: <Spin />, className: 'text-foreground' },
  drafted: { label: 'Drafted', icon: <CheckIcon />, className: 'text-foreground' },
  done: { label: 'Done', icon: <CheckIcon />, className: 'text-foreground' },
  added: { label: 'Added', icon: <CheckIcon />, className: 'text-foreground' },
  approved: { label: 'Approved', icon: <CheckIcon />, className: 'text-ok' },
  draft: { label: 'Draft', icon: <PencilIcon />, className: 'border-dashed text-muted-foreground' },
  failed: { label: 'Failed', icon: <XIcon />, className: 'text-destructive' },
  stale: { label: 'Out of date', icon: <XIcon />, className: 'text-destructive' },
  info: { label: 'Information', icon: <InfoIcon />, className: 'text-muted-foreground' },
}

/**
 * The status badge: an outline chip, icon then word, never filled, so nothing competes
 * with a band. Ink means the machine finished, green a human approved or a check passed,
 * crimson failed or blocking. `label` overrides the word ("Extracting v4").
 */
export function StatusBadge({ status, label, className }: { status: BadgeState; label?: string; className?: string }) {
  const s = STATES[status]
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-input bg-transparent px-1.5 text-xs font-bold leading-none [&>svg]:size-3',
        s.className,
        className,
      )}
    >
      {s.icon}
      {label ?? s.label}
    </span>
  )
}

/** Semantic marks are always an icon plus a word. */
export function DecisionMark({ decision, className }: { decision: Decision; className?: string }) {
  if (decision === 'approved')
    return (
      <span className={cn('inline-flex items-center gap-1 text-sm text-ok', className)}>
        <CheckIcon className="size-3.5" /> Approved
      </span>
    )
  if (decision === 'rejected')
    return (
      <span className={cn('inline-flex items-center gap-1 text-sm text-destructive', className)}>
        <XIcon className="size-3.5" /> Rejected
      </span>
    )
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm text-muted-foreground', className)}>
      <CircleDashedIcon className="size-3.5" /> Pending
    </span>
  )
}

export function ReviewMark({ required, className }: { required: boolean; className?: string }) {
  if (!required) return <span className={cn('text-sm text-muted-foreground', className)}>No</span>
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm text-muted-foreground', className)}>
      <FlagIcon className="size-3.5" /> Review
    </span>
  )
}

export function Ok({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-start gap-1.5 text-sm text-ok', className)}>
      <CheckIcon className="mt-0.5 size-3.5 shrink-0" />
      <span className="text-foreground">{children}</span>
    </span>
  )
}

export function Bad({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-start gap-1.5 text-sm text-destructive', className)}>
      <OctagonXIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </span>
  )
}

export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-start gap-1.5 text-sm text-muted-foreground', className)}>
      <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </span>
  )
}

export function Notice({ kind = 'info', children, className }: { kind?: 'info' | 'danger'; children: ReactNode; className?: string }) {
  return (
    <div
      role={kind === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2 rounded-md px-3 py-2 text-sm', kind === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground', className)}
    >
      {kind === 'danger' && <OctagonXIcon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-none bg-muted" />
      ))}
    </div>
  )
}

export function Empty({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-start gap-3 py-8 text-muted-foreground', className)}>
      <p className="max-w-prose text-base">{children}</p>
      {action && <div className="flex gap-2">{action}</div>}
    </div>
  )
}

export function PageTitle({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <h1 className="text-lg font-bold leading-tight">{children}</h1>
      {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
    </div>
  )
}
