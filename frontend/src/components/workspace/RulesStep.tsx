import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlayIcon, RefreshCwIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { api, formatDate, formatDuration, type Asset, type RulesVersionSummary, type WorkspaceDetail } from '@/api'
import { Bad, Note, Notice, Ok, StatusBadge } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { ExtractionLive } from './ExtractionLive'
import { count, firstLine, gapOf, sentence, type Gap } from './format'
import { Todo, Vstr } from './parts'
import { outline } from './styles'

interface RulesStepProps {
  ws: WorkspaceDetail
  extractModel?: string
}

type Approved = NonNullable<WorkspaceDetail['approved']>

function names(ids: string[]): string {
  if (ids.length <= 2) return ids.join(' and ')
  return `${ids.slice(0, 2).join(', ')} and ${count(ids.length - 2, 'more')}`
}

export function RulesStep({ ws, extractModel }: RulesStepProps) {
  const qc = useQueryClient()
  const versions = ws.rules_versions
  const approved = ws.approved
  const stale = !!approved && !approved.coverage.ok
  const extracting = versions.find((v) => v.status === 'extracting')
  const draft = versions.find((v) => v.status === 'draft' && (!approved || v.version > approved.version))
  const newest = versions.at(0)
  const approvedVersion = versions.find((v) => v.id === approved?.id)
  const onlyTheApproved = versions.length === 1 && !!approvedVersion && !stale

  // The log on show: the one the user picked, else a running or freshly failed extraction.
  const [picked, setPicked] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const extractingId = extracting?.id
  useEffect(() => {
    if (extractingId && extractingId !== dismissed) setPicked(extractingId)
  }, [extractingId, dismissed])
  const failedNewest = newest?.status === 'failed' && newest.origin === 'extracted' && newest.id !== dismissed ? newest.id : null
  const shownId = picked ?? failedNewest
  const shown = versions.find((v) => v.id === shownId)

  const assets = useQuery({ queryKey: ['assets', ws.id], queryFn: () => api.assets(ws.id), enabled: stale })

  const extract = useMutation({
    mutationFn: () => api.extractRules(ws.id),
    onSuccess: (rules) => {
      qc.setQueryData<WorkspaceDetail>(['workspace', ws.id], (old) =>
        old && !old.rules_versions.some((v) => v.id === rules.id) ? { ...old, rules_versions: [rules, ...old.rules_versions] } : old,
      )
      setDismissed(null)
      setPicked(rules.id)
      qc.invalidateQueries({ queryKey: ['workspace', ws.id] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: (error) => toast.error(`Could not start the extraction. ${sentence(error.message)}`),
  })

  const blocked = !ws.document
    ? 'Add the knowledge document in step 1 first.'
    : ws.assets.count === 0
      ? 'Add at least one asset in step 2 first.'
      : extracting
        ? `v${extracting.version} is extracting. Wait for it to finish.`
        : null
  const canExtract = !blocked && !extract.isPending

  function hide(id: string) {
    setDismissed(id)
    setPicked(null)
  }

  const extractButton = (variant: 'default' | 'outline', label: string) => (
    <Button variant={variant} className={cn(variant === 'outline' && outline, 'max-sm:h-11 max-sm:flex-1')} disabled={!canExtract} onClick={() => extract.mutate()}>
      {variant === 'default' ? <PlayIcon data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
      {extract.isPending ? 'Starting' : label}
    </Button>
  )

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      {stale && approved && (
        <StalePanel ws={ws} approved={approved} assets={assets.data?.assets} draft={draft} blocked={blocked} extractButton={extractButton} />
      )}

      {versions.length === 0 && (
        <section aria-labelledby="rules-first" className="panel grid justify-items-start gap-3 p-4 sm:p-5">
          <h3 id="rules-first" className="text-md font-bold">
            Extract the first version
          </h3>
          <ul className="grid gap-1.5">
            <li>{ws.document ? <Ok>Knowledge: {ws.document.filename}</Ok> : <Todo>Add the knowledge document</Todo>}</li>
            <li>
              {ws.assets.count > 0 ? (
                <Ok>
                  Assets: {count(ws.assets.count, 'asset')}, {count(ws.assets.equipment_types.length, 'equipment type')}
                </Ok>
              ) : (
                <Todo>Add at least one asset</Todo>
              )}
            </li>
          </ul>
          <p className="max-w-[68ch] text-sm text-muted-foreground">
            {extractModel ?? 'The model'} writes one section per equipment type and classifies every redundancy string, citing a source for each rule.
          </p>
          <div className="flex w-full flex-wrap gap-2">{extractButton('default', 'Extract rules')}</div>
          {blocked && <p className="text-sm text-muted-foreground">{blocked}</p>}
        </section>
      )}

      {approved && !stale && (
        <section aria-labelledby="rules-current" className="panel p-4 sm:p-5">
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1 basis-64">
              <h3 id="rules-current" className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold tabular-nums">v{approved.version}</span>
                <StatusBadge status="approved" />
                <span className="text-sm text-muted-foreground">in use for new processes</span>
              </h3>
              <ul className="mt-2 grid gap-1">
                <li>
                  <Ok>
                    Covers {count(ws.assets.equipment_types.length, 'equipment type')} and {count(ws.assets.redundancy_values.length, 'redundancy string')}
                  </Ok>
                </li>
                {approved.coverage.warnings.map((w, i) => (
                  <li key={i}>
                    <Note>{w}</Note>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2 max-sm:w-full">
              {approvedVersion?.origin === 'extracted' && (
                <Button variant="ghost" className="max-sm:h-11" aria-pressed={shownId === approved.id} onClick={() => (shownId === approved.id ? hide(approved.id) : setPicked(approved.id))}>
                  {shownId === approved.id ? 'Hide log' : 'Log'}
                </Button>
              )}
              {extractButton('outline', 'Extract again')}
              <Button asChild className="max-sm:h-11 max-sm:flex-1">
                <Link to={`/w/${ws.id}/rules/${approved.id}`}>Open rules</Link>
              </Button>
            </div>
          </div>
          {blocked && <p className="mt-2 text-sm text-muted-foreground">{blocked}</p>}
        </section>
      )}

      {draft && !stale && !extracting && shown?.id !== draft.id && (
        <section className="panel flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
          <span className="text-base font-bold tabular-nums">v{draft.version}</span>
          <StatusBadge status="draft" />
          <span className="min-w-0 flex-1 basis-56 text-sm text-muted-foreground">
            {approved ? `Waiting for review. v${approved.version} stays in use until you approve it.` : 'Waiting for review. Approve it to unlock processes.'}
          </span>
          <Button asChild className="max-sm:h-11 max-sm:w-full">
            <Link to={`/w/${ws.id}/rules/${draft.id}`}>Review v{draft.version}</Link>
          </Button>
        </section>
      )}

      {shown && (
        <section aria-labelledby="extraction-title" className="panel p-4 sm:p-5">
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 id="extraction-title" className="text-md font-bold">
              {shown.status === 'extracting' ? `Extracting v${shown.version}` : shown.status === 'failed' ? `Extraction of v${shown.version} failed` : `Extracted v${shown.version}`}
            </h3>
            <StatusBadge status={shown.status} />
            <span className="text-sm text-muted-foreground">
              Started {formatDate(shown.created_at)}
              {shown.meta.ms != null && `, took ${formatDuration(shown.meta.ms)}`}
            </span>
            <div className="flex gap-2 sm:ml-auto">
              {(shown.status === 'draft' || shown.status === 'approved') && (
                <Button asChild>
                  <Link to={`/w/${ws.id}/rules/${shown.id}`}>Open v{shown.version}</Link>
                </Button>
              )}
              {shown.status !== 'extracting' && (
                <Button variant="ghost" onClick={() => hide(shown.id)}>
                  Hide log
                </Button>
              )}
            </div>
          </div>
          {shown.status === 'failed' && shown.error && (
            <Notice kind="danger" className="mb-4">
              {sentence(firstLine(shown.error))} Extract again; if it keeps failing, check the model settings on the server.
            </Notice>
          )}
          <ExtractionLive jobId={shown.id} />
        </section>
      )}

      {versions.length > 0 && !onlyTheApproved && <VersionsList ws={ws} shownId={shownId ?? null} onLog={(id) => (id === shownId ? hide(id) : setPicked(id))} />}
    </div>
  )
}

interface StalePanelProps {
  ws: WorkspaceDetail
  approved: Approved
  assets: Asset[] | undefined
  draft: RulesVersionSummary | undefined
  blocked: string | null
  extractButton: (variant: 'default' | 'outline', label: string) => React.ReactNode
}

function StalePanel({ ws, approved, assets, draft, blocked, extractButton }: StalePanelProps) {
  const v = approved.version
  const on = (match: (a: Asset) => boolean) => {
    const ids = (assets ?? []).filter(match).map((a) => a.equipment_id)
    return ids.length ? ` on ${names(ids)}` : ''
  }
  const gap = (g: Gap) => {
    if (g.kind === 'type')
      return (
        <Bad>
          <b>{g.value}</b>
          <span className="text-muted-foreground">
            , a new equipment type{on((a) => a.equipment_type === g.value)}. v{v} has no section for it.
          </span>
        </Bad>
      )
    if (g.kind === 'redundancy')
      return (
        <Bad>
          <Vstr>{g.value}</Vstr>
          <span className="text-muted-foreground">
            , a new redundancy string{on((a) => a.redundancy === g.value)}. v{v} does not classify it.
          </span>
        </Bad>
      )
    return <Bad>{g.message}</Bad>
  }

  return (
    <section aria-labelledby="rules-stale" className="rounded-xl border border-destructive bg-card p-4 sm:p-5">
      <h3 id="rules-stale" className="flex items-start gap-2 text-md font-bold">
        <XIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
        v{v} is out of date, so new processes are blocked
      </h3>
      <ul className="mt-3 grid gap-1.5">
        {approved.coverage.errors.map((message, i) => (
          <li key={i}>{gap(gapOf(message))}</li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        {draft ? (
          <>
            <Button asChild className="max-sm:h-11 max-sm:flex-1">
              <Link to={`/w/${ws.id}/rules/${draft.id}`}>Review v{draft.version}</Link>
            </Button>
            {extractButton('outline', 'Extract again')}
          </>
        ) : (
          <>
            {extractButton('default', 'Extract again')}
            <Button asChild variant="outline" className={cn(outline, 'max-sm:h-11 max-sm:flex-1')}>
              <Link to={`/w/${ws.id}/rules/${approved.id}`}>Edit v{v} by hand</Link>
            </Button>
          </>
        )}
      </div>
      {draft && <p className="mt-2 text-sm text-muted-foreground">v{draft.version} is newer and may already cover these; its review shows the coverage check.</p>}
      {blocked && <p className="mt-2 text-sm text-muted-foreground">{blocked}</p>}
    </section>
  )
}

function VersionsList({ ws, shownId, onLog }: { ws: WorkspaceDetail; shownId: string | null; onLog: (id: string) => void }) {
  const versions = ws.rules_versions
  const versionOf = (id: string | undefined) => versions.find((v) => v.id === id)?.version
  const stale = !!ws.approved && !ws.approved.coverage.ok

  return (
    <section aria-labelledby="rules-versions" className="grid gap-2">
      <h3 id="rules-versions" className="flex items-baseline gap-2 text-sm font-semibold">
        Versions
        <span className="font-normal text-muted-foreground tabular-nums">{versions.length}</span>
      </h3>
      <ul className="panel divide-y divide-border">
        {versions.map((v) => {
          const used = ws.processes.filter((p) => p.rules_version_id === v.id).map((p) => p.number)
          const inUse = ws.approved?.id === v.id
          const origin =
            v.origin === 'edited'
              ? versionOf(v.meta.edited_from)
                ? `Edited from v${versionOf(v.meta.edited_from)}`
                : 'Written by hand'
              : v.status === 'failed'
                ? sentence(firstLine(v.error) || 'The extraction failed')
                : v.meta.model
                  ? `Extracted by ${v.meta.model}`
                  : 'Extracted'
          const usedBy = used.length === 0 ? 'Not used yet' : used.length === 1 ? `Used by process ${used[0]}` : `Used by ${count(used.length, 'process', 'processes')}`
          return (
            <li key={v.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5', v.id === shownId && 'bg-accent')}>
              <span className="w-8 text-base font-bold tabular-nums">v{v.version}</span>
              <span className="flex items-center gap-2">
                <StatusBadge status={v.status} label={v.status === 'approved' && !inUse ? 'Superseded' : undefined} />
                {inUse && stale && (
                  <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                    <XIcon className="size-3" />
                    Out of date
                  </span>
                )}
              </span>
              <span className={cn('min-w-0 flex-1 basis-56 truncate text-sm', v.status === 'failed' ? 'text-destructive' : 'text-muted-foreground')} title={origin}>
                {origin}, {formatDate(v.created_at)}. {usedBy}.
              </span>
              <span className="flex gap-1">
                {v.origin === 'extracted' && (
                  <Button variant="ghost" size="sm" onClick={() => onLog(v.id)} aria-pressed={v.id === shownId}>
                    {v.id === shownId ? 'Hide log' : 'Log'}
                  </Button>
                )}
                {(v.status === 'draft' || v.status === 'approved') && (
                  <Button asChild variant="outline" size="sm" className={outline}>
                    <Link to={`/w/${ws.id}/rules/${v.id}`}>Open</Link>
                  </Button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
