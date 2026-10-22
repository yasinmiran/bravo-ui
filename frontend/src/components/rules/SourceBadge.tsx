import { Tag } from '@/components/marks'
import { cn } from '@/lib/utils'

import { parseSources, type Source } from './source'

const INFERRED_TITLE = 'Not stated in any source. A choice made in the rules file; check it.'

const chip = 'inline-flex min-h-5 max-w-full items-center gap-1 rounded-sm px-1 text-xs font-normal leading-4 whitespace-nowrap align-[0.1em]'

/** The kind is carried by shape and prefix, never by colour: colour is spent on urgency. */
export function SourceBadge({ source }: { source: Source }) {
  switch (source.kind) {
    case 'registry':
      return (
        <span className={cn(chip, 'border border-border bg-muted text-muted-foreground')}>
          registry:
          {source.detail
            .split(/,\s*/)
            .filter(Boolean)
            .map((id, i) => (
              <Tag key={i} className="text-foreground">
                {id}
              </Tag>
            ))}
        </span>
      )
    case 'inferred':
      return (
        <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5">
          <span title={INFERRED_TITLE} className={cn(chip, 'border-[1.5px] border-dashed border-input font-bold text-foreground italic')}>
            inferred
          </span>
          {source.detail && <span className="text-xs text-muted-foreground">{source.detail}</span>}
        </span>
      )
    case 'notes':
      return <span className={cn(chip, 'border border-border bg-muted text-muted-foreground')}>notes: {source.detail}</span>
    default:
      return <span className={cn(chip, 'border border-border bg-muted text-muted-foreground')}>{source.detail}</span>
  }
}

export function SourceBadges({ source, className }: { source: string; className?: string }) {
  const sources = parseSources(source)
  if (!sources.length) return null
  return (
    <span className={cn('inline-flex max-w-full flex-wrap items-center gap-1 align-baseline', className)}>
      {sources.map((s, i) => (
        <SourceBadge key={i} source={s} />
      ))}
    </span>
  )
}
