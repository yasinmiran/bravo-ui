import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDownIcon, DownloadIcon, FileSpreadsheetIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { api, DEFAULT_BANDS, download, useJobEvents, type Asset } from '@/api'
import { LoadingRows, Notice, StatusBadge } from '@/components/marks'
import { Ticker } from '@/components/process/bits'
import { deriveLanes, formatClock, formatSeconds, formatStarted, plural, type Bands } from '@/components/process/derive'
import { useNow } from '@/components/process/hooks'
import type { LadderContext } from '@/components/process/Ladder'
import { PipelineView } from '@/components/process/Lanes'
import { TicketsView } from '@/components/process/Tickets'
import { Crumbs } from '@/components/Shell'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Tab = 'pipeline' | 'tickets'

export function ProcessPage() {
  const { processId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()

  const process = useQuery({
    queryKey: ['process', processId],
    queryFn: () => api.process(processId),
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 1500 : false),
  })
  const p = process.data
  const workspace = useQuery({ queryKey: ['workspace', p?.workspace_id], queryFn: () => api.workspace(p!.workspace_id), enabled: !!p })
  const assets = useQuery({ queryKey: ['assets', p?.workspace_id], queryFn: () => api.assets(p!.workspace_id), enabled: !!p })
  const rules = useQuery({ queryKey: ['rules', p?.rules_version_id], queryFn: () => api.rules(p!.rules_version_id), enabled: !!p })
  const { events, finished } = useJobEvents(processId)

  // The stream ends after the last ticket is written; one more fetch picks the final rows up.
  useEffect(() => {
    if (finished) qc.invalidateQueries({ queryKey: ['process', processId] })
  }, [finished, processId, qc])

  // Events on screen at first paint stay still; only later ones animate in.
  const [quietMax, setQuietMax] = useState<number | null>(null)
  if (quietMax === null && events.length) setQuietMax(events[events.length - 1].id)

  // Pipeline while it runs, Tickets once it is done, decided when the page first loads.
  const [initialTab, setInitialTab] = useState<Tab | null>(null)
  if (initialTab === null && p) setInitialTab(p.status === 'running' ? 'pipeline' : 'tickets')
  const tabParam = params.get('tab')
  const tab: Tab = tabParam === 'tickets' || tabParam === 'pipeline' ? tabParam : (initialTab ?? 'pipeline')
  const selected = params.get('ticket')

  const setTab = useCallback(
    (next: Tab, ticket?: string | null) =>
      setParams(
        (prev) => {
          const q = new URLSearchParams(prev)
          q.set('tab', next)
          if (ticket === null || next === 'pipeline') q.delete('ticket')
          else if (ticket) q.set('ticket', ticket)
          return q
        },
        { replace: true },
      ),
    [setParams],
  )

  const running = p?.status === 'running'
  const now = useNow(!!running)
  const lanes = useMemo(() => (p ? deriveLanes(p.input.findings, events) : []), [p, events])
  const bands: Bands = p?.bands ?? DEFAULT_BANDS
  const assetMap = useMemo(() => new Map<string, Asset>((assets.data?.assets ?? []).map((a) => [a.equipment_id, a])), [assets.data])
  const firstEventAt = events[0]?.ts
  const startedAt = p?.started_at
  const tickets = p?.tickets
  const rulesData = rules.data?.rules ?? null
  const ctx: LadderContext = useMemo(
    () => ({
      t0: firstEventAt ? Date.parse(firstEventAt) : startedAt ? Date.parse(startedAt) : 0,
      quietMax: quietMax ?? 0,
      rules: rulesData,
      bands,
      onOpenTicket: (ticketId: string) => {
        const row = tickets?.find((t) => t.ticket.ticket_id === ticketId)
        if (row) setTab('tickets', row.id)
        else toast('That ticket is not written yet.')
      },
    }),
    [firstEventAt, startedAt, tickets, rulesData, bands, quietMax, setTab],
  )

  if (process.isPending) return <LoadingRows rows={8} />
  if (process.isError)
    return (
      <div className="mx-auto grid w-full max-w-prose content-start gap-4 py-12">
        <Crumbs>
          <span className="text-sm text-muted-foreground">Process</span>
        </Crumbs>
        <h1 className="text-lg font-bold leading-tight">This process is not available</h1>
        <p className="text-sm text-muted-foreground">{process.error.message.replace(/^\w/, (c) => c.toUpperCase())}. It may have been deleted with its workspace.</p>
        <Button asChild className="w-fit">
          <Link to="/">Go to the workspaces</Link>
        </Button>
      </div>
    )
  if (!p) return null

  const total = p.total || p.input.findings.length
  const drafted = p.counts.done
  const failed = p.counts.failed
  const remaining = Math.max(0, total - drafted - failed)
  const retried = lanes.filter((l) => l.attempts > 1).length
  const approved = p.tickets.filter((t) => t.decision === 'approved').length
  const elapsedMs = running ? now - Date.parse(p.started_at) : p.finished_at ? Date.parse(p.finished_at) - Date.parse(p.started_at) : 0
  const pct = total ? ((drafted + failed) / total) * 100 : 0
  const finishedLanes = lanes.filter((l) => l.pickedAt && l.endedAt)
  const avg = finishedLanes.length ? finishedLanes.reduce((s, l) => s + (l.endedAt! - l.pickedAt!), 0) / finishedLanes.length : null
  const left = running && avg ? (remaining * avg) / Math.max(1, p.input.workers ?? 1) : null
  const name = workspace.data?.name ?? 'Workspace'

  return (
    <div className="space-y-5">
      <Crumbs>
        <Breadcrumb>
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbLink asChild className="truncate">
                <Link to={`/w/${p.workspace_id}`}>{name}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="whitespace-nowrap">Process {p.number}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Crumbs>

      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-lg font-bold leading-tight">Process {p.number}</h1>
          <StatusBadge status={p.status} />
          {p.input.fake_model && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="cursor-help rounded-sm">
                  <StatusBadge status="info" label="Fake model" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64 text-left">
                Replies are deterministic stand-ins with simulated latency, no API calls.
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="grid gap-1 text-sm text-muted-foreground">
          <p className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-0.5">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <FileSpreadsheetIcon className="size-4 shrink-0" />
              <span className="truncate">{p.filename ?? p.input.filename}</span>
            </span>
            <span>{plural(total, 'finding')}</span>
            <span>rules v{p.rules_version ?? '?'}</span>
            <span>
              {p.model} on {plural(p.input.workers ?? 1, 'worker')}
            </span>
          </p>
          {running ? (
            <div className="mt-1 grid max-w-3xl gap-1.5">
              <Progress aria-label="Tickets drafted" value={pct} className="h-1.5 bg-border [&>[data-slot=progress-indicator]]:bg-foreground [&>[data-slot=progress-indicator]]:transition-transform [&>[data-slot=progress-indicator]]:duration-[320ms]" />
              <div className="flex flex-wrap justify-between gap-x-4 text-xs tabular-nums">
                <span>
                  <Ticker value={drafted + failed} /> of {total} drafted, {p.counts.running} in progress, {p.counts.queued} queued
                  {retried > 0 && `, ${retried} retried`}
                </span>
                <span>
                  {formatClock(elapsedMs)} elapsed{left != null && `, about ${formatSeconds(left)} left at this pace`}
                </span>
              </div>
            </div>
          ) : (
            <p className={cn('tabular-nums', failed > 0 && 'text-destructive')}>
              {plural(drafted, 'ticket')} drafted in {formatSeconds(elapsedMs)}
              {failed > 0 && `, ${failed} failed`}
              {retried > 0 && `, ${retried} retried`}.
            </p>
          )}
        </div>

        {p.status === 'failed' && (
          <Notice kind="danger" className="whitespace-pre-wrap">
            {p.error?.split('\n')[0] ?? 'The process failed.'}
          </Notice>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList aria-label="Process views" className="h-9 rounded-md border border-input bg-muted p-0.5 max-sm:h-11">
              <TabsTrigger value="pipeline" className={TRIGGER}>
                Pipeline
              </TabsTrigger>
              <TabsTrigger value="tickets" className={TRIGGER}>
                Tickets
                <Ticker value={p.tickets.length} className="rounded-sm bg-muted px-1.5 text-xs text-muted-foreground" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {!running && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-input">
                  <DownloadIcon data-icon="inline-start" />
                  Export
                  <ChevronDownIcon data-icon="inline-end" className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => download(api.exportUrl(p.id, 'all'), `tickets-process-${p.number}.json`)}>
                  All tickets
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{p.tickets.length}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => download(api.exportUrl(p.id, 'approved'), `tickets-process-${p.number}-approved.json`)}>
                  Approved only
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{approved}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {tab === 'pipeline' ? (
        <PipelineView process={p} lanes={lanes} events={events} ctx={ctx} assets={assetMap} />
      ) : (
        <TicketsView process={p} bands={bands} rules={rules.data?.rules ?? null} lanes={lanes} selectedId={selected} onSelect={(id) => setTab('tickets', id)} />
      )}
      <p className="text-xs text-muted-foreground">
        Process {p.id}, rules version {p.rules_version_id}, started {formatStarted(p.started_at)}
        {p.finished_at ? `, finished ${formatStarted(p.finished_at)}` : ''}
        {p.input.fake_model ? ', fake model: deterministic replies with simulated latency, no API calls' : ''}.
      </p>
    </div>
  )
}

const TRIGGER = cn(
  'h-full gap-2 rounded-[4px] px-3 text-sm font-medium text-muted-foreground',
  'data-active:bg-card data-active:font-bold data-active:text-foreground data-active:shadow-[0_0_0_1px_var(--input)]',
)
