import { bandKey } from '@/api'
import { cn } from '@/lib/utils'

import { bandSegments, STEP_STATE, type Bands, type UrgencyStep } from './derive'

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

/** The code's steps as a numbered sequence, each with its value and what it did. */
export function UrgencySteps({ steps, compact = false }: { steps: UrgencyStep[]; compact?: boolean }) {
  return (
    <ol className={cn('grid border-t border-border', compact && 'max-w-[68ch]')}>
      {steps.map((s, i) => (
        <li
          key={s.id}
          className={cn(
            'grid gap-x-3 border-b border-border py-2 text-sm',
            compact ? 'grid-cols-[minmax(0,1fr)_3rem]' : 'grid-cols-[1.5rem_minmax(0,1fr)_3rem] py-3',
          )}
        >
          {!compact && <span className="row-span-3 font-bold text-muted-foreground">{i + 1}</span>}
          <span className={cn('font-bold', s.state === 'na' && 'font-medium text-muted-foreground')}>{s.name}</span>
          <span className={cn('text-right text-base font-extrabold tabular-nums', s.state === 'na' && 'font-medium text-muted-foreground')}>
            {fmt(s.value)}
          </span>
          <span className="col-span-2 text-muted-foreground">
            {s.why}
            {s.reason && <span className="block text-muted-foreground">{s.reason}.</span>}
          </span>
          <span
            className={cn(
              'mt-0.5 text-xs text-muted-foreground',
              (s.state === 'changed' || s.state === 'start') && 'font-bold text-foreground',
            )}
          >
            {STEP_STATE[s.state]}
          </span>
        </li>
      ))}
    </ol>
  )
}

const x = (v: number) => `${((Math.min(10, Math.max(1, v)) - 1) / 9) * 100}%`

/** A 1 to 10 line shaded by band: hollow dot at the weighted base, solid dot at the final score. */
export function NumberLine({
  base,
  score,
  bands,
  ticks,
}: {
  base: number
  score: number
  bands: Bands
  ticks: { value: number; label: string }[]
}) {
  const lo = Math.min(base, score)
  const hi = Math.max(base, score)
  return (
    <figure className="mt-7 mb-5 px-2" aria-label={`Urgency moves from ${fmt(base)} to ${score} on a scale of 1 to 10`}>
      <div className="relative h-3">
        {bandSegments(bands).map((s) => (
          <span
            key={s.band}
            className={cn('absolute inset-y-0', `band-${bandKey(s.band)}`)}
            style={{ left: x(s.from), width: `calc(${x(s.to)} - ${x(s.from)})` }}
          />
        ))}
        {ticks.map((t) => (
          <span key={t.value} className="absolute -top-2.5 -bottom-1 -ml-px w-0.5 bg-foreground" style={{ left: x(t.value) }}>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 pb-0.5 text-xs whitespace-nowrap text-muted-foreground">{t.label}</span>
          </span>
        ))}
        <span className="absolute top-1/2 -mt-px h-0.5 bg-foreground" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
        <span
          title={`Weighted base ${fmt(base)}`}
          className="absolute top-1/2 -mt-[7px] -ml-[7px] size-3.5 rounded-full border-2 border-foreground bg-card shadow-[0_0_0_2px_var(--card)]"
          style={{ left: x(base) }}
        />
        <span
          title={`Final urgency ${score}`}
          className="absolute top-1/2 -mt-[7px] -ml-[7px] size-3.5 rounded-full border-2 border-foreground bg-foreground shadow-[0_0_0_2px_var(--card)]"
          style={{ left: x(score) }}
        />
      </div>
      <div className="relative mt-2 h-4 text-xs text-muted-foreground" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="absolute -translate-x-1/2 tabular-nums" style={{ left: x(i + 1) }}>
            {i + 1}
          </span>
        ))}
      </div>
    </figure>
  )
}
