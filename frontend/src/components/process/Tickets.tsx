import { FlagIcon, SearchIcon, XIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { BANDS, bandKey, bandLabel, type BandName, type Decision, type ProcessDetail, type Rules, type TicketRow } from '@/api'
import { DecisionMark, Empty, ReviewMark, Sce, StatusBadge, Tag, Ucell } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import { Ticker } from './bits'
import { filtersActive, NO_FILTERS, rowBand, sortTickets, ticketMatches, type Bands, type Lane, type TicketFilters } from './derive'
import { usePageWidth } from '@/components/PageWidth'

import { useIsPhone } from './hooks'
import { onControl, shortcutFree } from './keys'
import { TicketPanel } from './TicketPanel'

/** Band distribution: one bar, segments in band order, counts in the legend. */
export function BandBar({
  rows,
  bands,
  active,
  onToggle,
  className,
}: {
  rows: TicketRow[]
  bands: Bands
  active?: BandName[]
  onToggle?: (band: BandName) => void
  className?: string
}) {
  const counts = BANDS.map((b) => ({ band: b.name, n: rows.filter((r) => rowBand(r, bands) === b.name).length }))
  const total = rows.length || 1
  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-[2px] bg-border" aria-hidden>
        {counts
          .filter((c) => c.n)
          .map((c) => (
            <motion.span
              key={c.band}
              layout
              className={cn('h-full', `band-${bandKey(c.band)}`)}
              style={{ width: `${(c.n / total) * 100}%` }}
              transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-1 gap-y-1">
        {counts.map((c) => {
          const pressed = active?.includes(c.band) ?? false
          const content = (
            <>
              <span className={cn('size-3 rounded-[2px]', `band-${bandKey(c.band)}`)} />
              <span>{bandLabel(c.band)}</span>
              <Ticker value={c.n} className="text-muted-foreground" />
            </>
          )
          return onToggle ? (
            <button
              key={c.band}
              type="button"
              aria-pressed={pressed}
              onClick={() => onToggle(c.band)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md border border-transparent px-2 text-sm hover:bg-muted',
                pressed && 'border-foreground bg-muted shadow-[inset_0_0_0_1px_var(--foreground)]',
              )}
            >
              {content}
            </button>
          ) : (
            <span key={c.band} className="inline-flex h-8 items-center gap-1.5 px-2 text-sm">
              {content}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-sm font-medium hover:bg-muted @max-[60rem]:h-11',
        pressed && 'border-foreground bg-muted shadow-[inset_0_0_0_1px_var(--foreground)]',
      )}
    >
      {children}
    </button>
  )
}

export function TicketsView({
  process,
  bands,
  rules,
  lanes,
  selectedId,
  onSelect,
}: {
  process: ProcessDetail
  bands: Bands
  rules: Rules | null
  lanes: Lane[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const phone = useIsPhone()
  const page = usePageWidth()
  // The table needs about 46rem beside the 28rem panel; narrower pages get the panel as a sheet.
  const sideBySide = !phone && (page == null || page >= 1216)
  const reduce = useReducedMotion()
  const tableRef = useRef<HTMLDivElement>(null)
  const [filters, setFilters] = useState<TicketFilters>(NO_FILTERS)
  const rows = useMemo(() => sortTickets(process.tickets), [process.tickets])
  const filtered = useMemo(() => rows.filter((r) => ticketMatches(r, filters, bands)), [rows, filters, bands])
  const reviewCount = rows.filter((r) => r.ticket.review_required).length
  const sceCount = rows.filter((r) => r.safety_critical_element).length
  const pendingLanes = lanes.filter((l) => l.phase === 'queued' || l.phase === 'running')

  // Rows that were already there when this view mounted do not get the "new" wash.
  const seen = useRef<Set<string> | null>(null)
  if (seen.current === null) seen.current = new Set(rows.map((r) => r.id))
  const isNew = (id: string) => !seen.current!.has(id)
  useEffect(() => {
    const t = setTimeout(() => rows.forEach((r) => seen.current!.add(r.id)), 1500)
    return () => clearTimeout(t)
  }, [rows])

  const index = filtered.findIndex((r) => r.id === selectedId)
  const move = (delta: number) => {
    if (!filtered.length) return
    const next = index < 0 ? (delta > 0 ? 0 : filtered.length - 1) : Math.min(filtered.length - 1, Math.max(0, index + delta))
    onSelect(filtered[next].id)
  }
  const nextPending = () => {
    const after = filtered.slice(index + 1).find((r) => r.decision === 'pending') ?? filtered.slice(0, Math.max(0, index)).find((r) => r.decision === 'pending')
    if (after) onSelect(after.id)
  }

  useEffect(() => {
    if (selectedId) return
    const onKey = (e: KeyboardEvent) => {
      if (!shortcutFree(e.target, tableRef.current) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        move(1)
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        move(-1)
      } else if (e.key === 'Enter' && filtered.length && !onControl(e.target)) onSelect(filtered[0].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const toggleBand = (band: BandName) =>
    setFilters((f) => ({ ...f, bands: f.bands.includes(band) ? f.bands.filter((b) => b !== band) : [...f.bands, band] }))

  const groups = BANDS.map((b) => ({ band: b.name, range: bands[b.name], rows: filtered.filter((r) => rowBand(r, bands) === b.name) })).filter(
    (g) => g.rows.length,
  )

  const panel = selectedId && (
    <TicketPanel
      key={selectedId}
      ticketId={selectedId}
      processId={process.id}
      bands={bands}
      rules={rules}
      onClose={() => onSelect(null)}
      onPrev={index > 0 ? () => move(-1) : undefined}
      onNext={index >= 0 && index < filtered.length - 1 ? () => move(1) : undefined}
      onDecided={() => nextPending()}
    />
  )

  if (!rows.length && !pendingLanes.length) return <Empty>No tickets yet. Approve the rules, then submit findings.</Empty>

  return (
    <div className={cn('grid items-start gap-4', selectedId && sideBySide && 'grid-cols-[minmax(0,1fr)_28rem]')}>
      <div className="grid min-w-0 gap-4">
        <div className="grid gap-3">
          <BandBar rows={rows} bands={bands} active={filters.bands} onToggle={toggleBand} />
          <div className="flex flex-wrap items-center gap-2">
            <Chip pressed={filters.review} onClick={() => setFilters((f) => ({ ...f, review: !f.review }))}>
              <FlagIcon className="size-3.5" /> Needs review <span className="font-normal text-muted-foreground">{reviewCount}</span>
            </Chip>
            <Chip pressed={filters.sce} onClick={() => setFilters((f) => ({ ...f, sce: !f.sce }))}>
              SCE only <span className="font-normal text-muted-foreground">{sceCount}</span>
            </Chip>
            <Select value={filters.decision} onValueChange={(v) => setFilters((f) => ({ ...f, decision: v as 'all' | Decision }))}>
              <SelectTrigger className="h-8 w-[10.5rem] border-input bg-card text-sm @max-[60rem]:h-11" aria-label="Decision">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All decisions</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <label className="relative ml-auto min-w-[12rem] flex-1 basis-56 @max-[60rem]:basis-full">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.query}
                onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
                placeholder="Find a ticket, finding or equipment"
                aria-label="Find a ticket"
                className="h-8 bg-card pl-8 @max-[60rem]:h-11"
              />
            </label>
            {filtersActive(filters) && (
              <Button variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)}>
                <XIcon data-icon="inline-start" />
                Clear filters
              </Button>
            )}
          </div>
        </div>

        <div ref={tableRef} className="panel relative overflow-x-auto">
          {filtered.length === 0 && rows.length > 0 && (
            <Empty className="px-4" action={<Button variant="outline" onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>}>
              No tickets match these filters.
            </Empty>
          )}
          {(filtered.length > 0 || pendingLanes.length > 0) && (
            <table className="w-full border-separate border-spacing-0 text-sm">
              <caption className="sr-only">Drafted tickets grouped by urgency band</caption>
              <thead className="@max-[60rem]:sr-only">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="w-12 border-b border-border bg-muted py-2 pl-4 font-medium">U</th>
                  <th className="border-b border-border bg-muted px-3 py-2 font-medium">Ticket</th>
                  <th className="border-b border-border bg-muted px-3 py-2 font-medium">Equipment</th>
                  <th className="border-b border-border bg-muted px-3 py-2 font-medium">Summary</th>
                  <th className="border-b border-border bg-muted px-3 py-2 text-right font-medium">L</th>
                  <th className="border-b border-border bg-muted px-3 py-2 text-right font-medium">I</th>
                  <th className="border-b border-border bg-muted px-3 py-2 font-medium">Review</th>
                  <th className="border-b border-border bg-muted py-2 pr-4 pl-3 font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <BandGroup key={g.band} band={g.band} range={g.range} rows={g.rows} selectedId={selectedId} onSelect={onSelect} isNew={isNew} reduce={!!reduce} />
                ))}
                {pendingLanes.length > 0 && !filtersActive(filters) && (
                  <>
                    <tr>
                      <td colSpan={8} className="bg-muted px-4 py-2 text-sm text-muted-foreground">
                        <b className="font-bold text-foreground">Not drafted yet</b> <span className="tabular-nums">{pendingLanes.length}</span>
                      </td>
                    </tr>
                    {pendingLanes.map((l) => (
                      <tr key={l.finding.finding_id} className="text-muted-foreground">
                        <td className="border-b border-border py-3 pl-4">
                          <span className="inline-flex size-8 items-center justify-center rounded-sm border border-dashed border-input text-xs">-</span>
                        </td>
                        <td className="border-b border-border px-3 py-3">
                          <span className="text-xs">{l.finding.finding_id}</span>
                        </td>
                        <td className="border-b border-border px-3 py-3">
                          <Tag className="text-muted-foreground">{l.finding.equipment_id}</Tag>
                          <div className="text-xs">{l.finding.equipment_type}</div>
                        </td>
                        <td className="border-b border-border px-3 py-3" colSpan={5}>
                          <StatusBadge status={l.phase === 'running' ? 'running' : 'queued'} label={l.phase === 'running' ? 'Running' : 'Queued'} />
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedId && sideBySide && (
        <aside className="panel sticky top-16 flex h-[calc(100dvh-5rem)] min-h-[32rem] flex-col overflow-hidden" aria-label="Ticket detail">
          {panel}
        </aside>
      )}
      {!sideBySide && (
        <Sheet open={!!selectedId} onOpenChange={(open) => !open && onSelect(null)}>
          <SheetContent
            side={phone ? 'bottom' : 'right'}
            className="gap-0 p-0 data-[side=bottom]:h-[92dvh] data-[side=right]:w-[30rem] data-[side=right]:sm:max-w-[30rem] [&>button]:hidden"
          >
            <SheetTitle className="sr-only">Ticket detail</SheetTitle>
            {panel}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

function BandGroup({
  band,
  range,
  rows,
  selectedId,
  onSelect,
  isNew,
  reduce,
}: {
  band: BandName
  range: [number, number]
  rows: TicketRow[]
  selectedId: string | null
  onSelect: (id: string) => void
  isNew: (id: string) => boolean
  reduce: boolean
}) {
  return (
    <>
      <tr>
        <td colSpan={8} className={cn('px-4 py-2', `band-${bandKey(band)}`)}>
          <span className="text-md font-extrabold">{bandLabel(band)}</span>
          <span className="ml-3 text-sm opacity-90">
            urgency {range[0]} to {range[1]}
          </span>
          <span className="float-right text-sm tabular-nums opacity-90">
            {rows.length} ticket{rows.length === 1 ? '' : 's'}
          </span>
        </td>
      </tr>
      {rows.map((row) => {
        const t = row.ticket
        const selected = row.id === selectedId
        const fresh = isNew(row.id)
        return (
          <motion.tr
            key={row.id}
            initial={fresh && !reduce ? { opacity: 0, backgroundColor: 'var(--accent)' } : false}
            animate={{ opacity: 1, backgroundColor: selected ? 'var(--accent)' : 'rgba(0,0,0,0)' }}
            transition={{ opacity: { duration: 0.2 }, backgroundColor: { duration: fresh ? 1.2 : 0.12 } }}
            onClick={() => onSelect(row.id)}
            aria-selected={selected}
            className={cn('cursor-pointer align-top hover:bg-muted', selected && 'shadow-[inset_3px_0_0_var(--primary)]')}
          >
            <td className="border-b border-border py-3 pl-4">
              <Ucell score={t.urgency.score} band={band} />
            </td>
            <td className="border-b border-border px-3 py-3 whitespace-nowrap">
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="tag rounded-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(row.id)
                  }}
                >
                  {t.ticket_id}
                </button>
                {row.safety_critical_element && <Sce />}
              </span>
              <span className="block text-xs text-muted-foreground">{t.finding_id}</span>
            </td>
            <td className="border-b border-border px-3 py-3 whitespace-nowrap">
              <Tag>{t.equipment_id}</Tag>
              <span className="block max-w-[12rem] truncate text-xs text-muted-foreground">{row.equipment_type}</span>
            </td>
            <td className="border-b border-border px-3 py-3">
              <p className="line-clamp-2 max-w-[56ch]">{t.summary}</p>
            </td>
            <td className="border-b border-border px-3 py-3 text-right text-base font-bold tabular-nums">{t.likelihood_of_failure.score}</td>
            <td className="border-b border-border px-3 py-3 text-right text-base font-bold tabular-nums">{t.impact_of_failure.score}</td>
            <td className="border-b border-border px-3 py-3 whitespace-nowrap">
              <ReviewMark required={t.review_required} />
            </td>
            <td className="border-b border-border py-3 pr-4 pl-3 whitespace-nowrap">
              <DecisionMark decision={row.decision} />
            </td>
          </motion.tr>
        )
      })}
    </>
  )
}
