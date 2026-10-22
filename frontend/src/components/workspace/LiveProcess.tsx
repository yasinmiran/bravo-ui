import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheetIcon } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'

import { api, useJobEvents } from '@/api'
import { LoadingRows, Note, Notice, StatusBadge } from '@/components/marks'
import { deriveLanes, formatClock, formatSeconds, plural } from '@/components/process/derive'
import { useNow } from '@/components/process/hooks'
import { ProcessPlan } from '@/components/process/Plan'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

import { sentence } from './format'
import { outline } from './styles'

/**
 * The process as an onlooker watches it: one card on the workspace page with the ten stages,
 * the spinner where the work is, and the way into the detail view once it is done.
 */
export function LiveProcess({ processId, onDismiss }: { processId: string; onDismiss: () => void }) {
  const qc = useQueryClient()
  const process = useQuery({
    queryKey: ['process', processId],
    queryFn: () => api.process(processId),
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 1500 : false),
  })
  const { events, finished } = useJobEvents(processId)
  useEffect(() => {
    if (finished) {
      qc.invalidateQueries({ queryKey: ['process', processId] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    }
  }, [finished, processId, qc])

  const p = process.data
  const running = p?.status === 'running'
  const now = useNow(!!running)
  const lanes = useMemo(() => (p ? deriveLanes(p.input.findings, events) : []), [p, events])

  if (process.isPending) return <LoadingRows rows={6} />
  if (process.isError) return <Notice kind="danger">The process did not load. {sentence(process.error.message)}</Notice>
  if (!p) return null

  const total = p.total || p.input.findings.length
  // Lanes come from the event stream and lead the polled counts, so the bar and the plan agree.
  const settled = Math.max(p.counts.done + p.counts.failed, lanes.filter((l) => l.phase === 'drafted' || l.phase === 'failed').length)
  const elapsedMs = running ? now - Date.parse(p.started_at) : p.finished_at ? Date.parse(p.finished_at) - Date.parse(p.started_at) : 0

  return (
    <section aria-labelledby="live-process" className="panel">
      <div className="grid gap-1 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <h3 id="live-process" className="flex items-center gap-2 text-base font-bold">
            Process {p.number}
            <StatusBadge status={p.status} />
          </h3>
          <span className="ml-auto font-mono text-sm text-muted-foreground tabular-nums">{running ? formatClock(elapsedMs) : formatSeconds(elapsedMs)}</span>
        </div>
        <p className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
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
      </div>

      <div className="px-4 py-3 sm:px-5">
        <ProcessPlan process={p} lanes={lanes} events={events} />
        {p.input.fake_model && <Note className="mt-2">Fake model: replies are deterministic stand-ins with simulated latency, no API calls.</Note>}
      </div>

      <div className="grid gap-3 border-t border-border px-4 py-4 sm:px-5">
        {running ? (
          <>
            <Progress
              aria-label="Tickets drafted"
              value={total ? (settled / total) * 100 : 0}
              className="h-1.5 bg-border [&>[data-slot=progress-indicator]]:bg-foreground [&>[data-slot=progress-indicator]]:transition-transform [&>[data-slot=progress-indicator]]:duration-[320ms]"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span className="tabular-nums">
                {settled} of {total} tickets drafted
              </span>
              <Button asChild variant="ghost" size="sm">
                <Link to={`/p/${p.id}?tab=pipeline`}>Watch the detail</Link>
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={p.status === 'failed' ? 'text-sm font-medium text-destructive' : 'text-sm text-muted-foreground'}>
              {p.status === 'failed'
                ? 'The process failed. Open it to see where.'
                : `${plural(p.counts.done, 'ticket')} drafted${p.counts.failed ? `, ${p.counts.failed} failed` : ''} in ${formatSeconds(elapsedMs)}.`}
            </p>
            <div className="flex flex-wrap gap-2 @max-[40rem]:w-full @max-[40rem]:[&>*]:flex-1">
              <Button variant="ghost" onClick={onDismiss}>
                New process
              </Button>
              <Button asChild variant="outline" className={outline}>
                <Link to={`/p/${p.id}?tab=pipeline`}>Open the timeline</Link>
              </Button>
              <Button asChild>
                <Link to={`/p/${p.id}?tab=tickets`}>Review tickets</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
