import { CircleDashedIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** A redundancy string or other literal value, set as code. */
export function Vstr({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cn('rounded-sm bg-muted px-1 py-px font-mono text-xs text-foreground', className)}>{children}</code>
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-sm border border-border bg-muted px-1.5 py-px text-xs text-foreground', className)}>{children}</span>
}

/** A check that has not been met yet: dashed circle, secondary ink. */
export function Todo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-start gap-1.5 text-sm text-muted-foreground', className)}>
      <CircleDashedIcon className="mt-0.5 size-3.5 shrink-0" />
      <span className="text-muted-foreground">{children}</span>
    </span>
  )
}

export function SubHeading({ children, aside, className, id }: { children: ReactNode; aside?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn('mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1', className)}>
      <h3 id={id} className="text-md font-bold">
        {children}
      </h3>
      {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
    </div>
  )
}
