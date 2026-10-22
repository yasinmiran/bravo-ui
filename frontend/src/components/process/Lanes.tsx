import { ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import { useState } from 'react'

import type { Asset, ProcessDetail, StageEvent } from '@/api'
import { Sce, Tag, Ucell } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

import { Literal, StateChip, Ticker } from './bits'
import { LANE_FILTERS, LANE_STAGES, bandOf, formatDay, formatSeconds, laneMatches, plural, stageIndex, stageLabel, type Lane, type LaneFilter } from './derive'
import { useIsPhone, useNow } from './hooks'
import { Ladder, type LadderContext } from './Ladder'
import { ProcessPlan } from './Plan'

/** The pipeline tab: the vertical plan on the left, one row per finding on the right, each opening to its events. */
export function PipelineView({
  process,
  lanes,
  events,
  ctx,
  assets,
}: {
  process: ProcessDetail
  lanes: Lane[]
  events: StageEvent[]
  ctx: LadderContext
  assets: Map<string, Asset>
}) {
  const phone = useIsPhone()
  const [filter, setFilter] = useState<LaneFilter>('all')
  // A person's toggle wins; otherwise a lane that failed opens itself.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const sceByFinding = new Map(process.tickets.map((t) => [t.ticket.finding_id, t.safety_critical_element]))
  const sceOf = (lane: Lane) => sceByFinding.get(lane.finding.finding_id) ?? assets.get(lane.finding.equipment_id)?.safety_critical_element ?? null
  const isOpen = (id: string, auto: boolean) => toggled[id] ?? auto
  const setAll = (open: boolean) => setToggled(Object.fromEntries(lanes.map((l) => [l.finding.finding_id, open])))
  const visible = lanes.filter((l) => laneMatches(l, filter))

  return (
    <div className="grid items-start gap-6 @min-[64rem]:grid-cols-[22rem_minmax(0,1fr)]">
      <section aria-labelledby="plan-title" className="panel p-4 @min-[64rem]:sticky @min-[64rem]:top-16">
        <h2 id="plan-title" className="mb-2 text-sm font-semibold">
          Stages
        </h2>
        <ProcessPlan process={process} lanes={lanes} events={events} expandable layout="stacked" />
      </section>

      <section aria-labelledby="findings-title" className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2 @max-[60rem]:flex-nowrap @max-[60rem]:overflow-x-auto @max-[60rem]:pb-1">
          <h2 id="findings-title" className="sr-only">
            Findings
          </h2>
          {LANE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium whitespace-nowrap transition-colors duration-100 hover:bg-muted @max-[60rem]:h-11',
                filter === f.id && 'border-foreground bg-muted',
              )}
            >
              {f.label}
              <Ticker value={lanes.filter((l) => laneMatches(l, f.id)).length} className="font-normal text-muted-foreground" />
            </button>
          ))}
          <div className="ml-auto flex shrink-0 gap-1">
            <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
              <ChevronsUpDownIcon data-icon="inline-start" />
              Expand all
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAll(false)}>
              <ChevronsDownUpIcon data-icon="inline-start" />
              Collapse all
            </Button>
          </div>
        </div>

        <div className="panel @max-[60rem]:-mx-4 @max-[60rem]:rounded-none @max-[60rem]:border-x-0">
          {visible.map((lane) => (
            <LaneRow
              key={lane.finding.finding_id}
              lane={lane}
              ctx={ctx}
              phone={phone}
              sce={sceOf(lane)}
              asset={assets.get(lane.finding.equipment_id)}
              open={isOpen(lane.finding.finding_id, lane.phase === 'failed')}
              onOpenChange={(open) => setToggled((t) => ({ ...t, [lane.finding.finding_id]: open }))}
            />
          ))}
          {visible.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No findings match this filter.</p>}
        </div>
      </section>
    </div>
  )
}

// ---------- lane ----------

function LaneState({ lane }: { lane: Lane }) {
  const running = lane.phase === 'running'
  const now = useNow(running)
  if (lane.phase === 'queued') {
    return (
      <>
        <StateChip tone="muted">Queued</StateChip>
        <small className="text-xs text-muted-foreground">waiting for a worker</small>
      </>
    )
  }
  if (running) {
    const label = stageLabel(LANE_STAGES[lane.head].id)
    const since = lane.pickedAt ? formatSeconds(now - lane.pickedAt).replace(/\.\d/, '') : ''
    return (
      <>
        <StateChip tone="running">{label}</StateChip>
        <small className="text-xs text-muted-foreground">
          {lane.head >= stageIndex('model') ? `attempt ${Math.max(1, lane.attempts)}, ${since}` : `picked up by ${lane.worker}`}
        </small>
      </>
    )
  }
  const took = lane.pickedAt && lane.endedAt ? formatSeconds(lane.endedAt - lane.pickedAt) : null
  const retries = lane.attempts - 1
  if (lane.phase === 'failed') {
    return (
      <>
        <StateChip tone="danger">Failed triage</StateChip>
        <small className="text-xs text-muted-foreground">after {plural(lane.attempts, 'attempt')}</small>
      </>
    )
  }
  return (
    <>
      <StateChip tone="ink">Drafted</StateChip>
      <small className="text-xs text-muted-foreground">
        {took ? `in ${took}` : 'done'}
        {retries > 0 ? `, ${plural(retries, 'retry', 'retries')}` : ''}
        {lane.worker ? `, ${lane.worker}` : ''}
      </small>
    </>
  )
}

function LaneTicket({ lane, ctx, compact = false }: { lane: Lane; ctx: LadderContext; compact?: boolean }) {
  const o = lane.outcome
  if (!o) return null
  const band = o.failed ? bandOf(10, ctx.bands) : (o.band ?? bandOf(o.urgency, ctx.bands))
  return (
    <span className="flex items-center gap-2.5">
      <Ucell score={o.failed ? 10 : o.urgency} band={band} className="size-7 text-sm" />
      {!compact && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            ctx.onOpenTicket(o.ticketId)
          }}
          className={cn(
            'text-left text-sm whitespace-nowrap text-muted-foreground underline-offset-4 hover:text-primary hover:underline',
            o.failed && 'font-bold text-destructive',
          )}
        >
          {o.ticketId}
          {o.failed && <span className="block text-xs leading-none">failed</span>}
        </button>
      )}
    </span>
  )
}

function Equipment({ lane, sce }: { lane: Lane; sce: boolean | null }) {
  const f = lane.finding
  return (
    <span className="flex min-w-0 flex-col pr-3">
      <span className="flex items-center gap-1.5">
        <Tag className={cn('text-base', lane.phase === 'queued' && 'text-muted-foreground')}>{f.equipment_id}</Tag>
        {sce && <Sce />}
      </span>
      <small className="truncate text-xs text-muted-foreground">{f.equipment_type}</small>
    </span>
  )
}

function Chevron({ open, label }: { open: boolean; label: string }) {
  return (
    <CollapsibleTrigger asChild>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="ml-1 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted @max-[60rem]:ml-0 @max-[60rem]:size-11"
      >
        <ChevronRightIcon className={cn('size-4 transition-transform duration-[120ms]', open && 'rotate-90')} />
      </button>
    </CollapsibleTrigger>
  )
}

const rowTone = (open: boolean) =>
  cn('cursor-pointer transition-colors duration-100 hover:bg-muted', open && 'bg-accent shadow-[inset_3px_0_0_var(--primary)] hover:bg-accent')

function LaneRow({
  lane,
  ctx,
  phone,
  sce,
  asset,
  open,
  onOpenChange,
}: {
  lane: Lane
  ctx: LadderContext
  phone: boolean
  sce: boolean | null
  asset: Asset | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const f = lane.finding
  const toggle = () => onOpenChange(!open)
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="border-b border-border last:border-b-0">
      {phone ? (
        <div
          onClick={toggle}
          className={cn('grid grid-cols-[2.75rem_minmax(0,1fr)_auto] gap-x-1 gap-y-2 py-3 pr-4 [grid-template-areas:"x_eq_tk""x_st_st"]', rowTone(open))}
        >
          <span className="[grid-area:x]">
            <Chevron open={open} label={`Show the events for ${f.finding_id}`} />
          </span>
          <span className="flex min-w-0 items-baseline gap-1.5 [grid-area:eq]">
            <span className="text-xs font-bold text-muted-foreground">{f.finding_id}</span>
            <Equipment lane={lane} sce={sce} />
          </span>
          <span className="[grid-area:tk]">
            <LaneTicket lane={lane} ctx={ctx} compact />
          </span>
          <span className="flex items-center gap-2 [grid-area:st]">
            <LaneState lane={lane} />
          </span>
        </div>
      ) : (
        <div onClick={toggle} className={cn('grid min-h-[3.25rem] grid-cols-[2.5rem_4.5rem_minmax(0,1fr)_minmax(11rem,auto)_auto] items-center gap-x-3 pr-4', rowTone(open))}>
          <Chevron open={open} label={`Show the events for ${f.finding_id}`} />
          <span className="text-sm font-bold text-muted-foreground">{f.finding_id}</span>
          <Equipment lane={lane} sce={sce} />
          <span className="grid justify-items-start gap-0.5 py-2">
            <LaneState lane={lane} />
          </span>
          <span className="min-w-[7.5rem]">
            <LaneTicket lane={lane} ctx={ctx} />
          </span>
        </div>
      )}
      <CollapsibleContent>
        <div className="grid gap-8 border-t border-border bg-card py-5 pr-6 pl-[2.75rem] @min-[75rem]:grid-cols-[minmax(0,1fr)_22rem] @max-[60rem]:gap-5 @max-[60rem]:p-4">
          <section aria-label={`Events for ${f.finding_id}`}>
            <h3 className="mb-4 text-sm font-semibold text-muted-foreground">Events</h3>
            <Ladder lane={lane} ctx={ctx} sce={sce} />
          </section>
          <FindingContext lane={lane} asset={asset} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function FindingContext({ lane, asset }: { lane: Lane; asset: Asset | undefined }) {
  const f = lane.finding
  return (
    <section className="grid content-start gap-4 text-sm">
      <h3 className="text-sm font-semibold text-muted-foreground">Finding {f.finding_id}</h3>
      <blockquote className="max-w-[68ch] border-l-2 border-input pl-3 leading-5 text-foreground">{f.finding_description}</blockquote>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        <dt className="text-muted-foreground">Reported</dt>
        <dd>
          {formatDay(f.reported_date)} by {f.reported_by}, {f.reporter_role}
        </dd>
        <dt className="text-muted-foreground">Inspection</dt>
        <dd>
          {f.inspection_type}, {f.inspection_method}
        </dd>
        <dt className="text-muted-foreground">Asset</dt>
        <dd>
          <Tag>{f.equipment_id}</Tag> {asset?.service_description ?? f.equipment_type}
        </dd>
        {asset && (
          <>
            <dt className="text-muted-foreground">Registry</dt>
            <dd>
              Criticality {asset.criticality_score}, reliability {asset.reliability_score} (start likelihood {11 - asset.reliability_score})
            </dd>
            <dt className="text-muted-foreground">Redundancy</dt>
            <dd>
              <Literal>{asset.redundancy}</Literal>
            </dd>
          </>
        )}
      </dl>
    </section>
  )
}
