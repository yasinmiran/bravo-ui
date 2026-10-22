import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDownIcon, CircleAlertIcon, FileSpreadsheetIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { api, ApiError, type Asset, type AssetInput, type AssetPatch, type AssetsResponse, type WorkspaceDetail } from '@/api'
import { Bad, Empty, LoadingRows, Notice } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { AssetForm } from './AssetDialog'
import { AssetTable } from './AssetTable'
import { DropZone } from './DropZone'
import { count, gapOf, problemsOf, sentence } from './format'
import { Chip } from './parts'
import { outline } from './styles'

const ACCEPT = '.csv,text/csv'
const COLUMNS = 'equipment_id, equipment_type, service_description, criticality_score, reliability_score, safety_critical_element, redundancy, engineer_comment'
const TYPE_LIST = 'asset-type-options'
const REDUNDANCY_LIST = 'asset-redundancy-options'

interface Filters {
  type: string | null
  redundancy: string | null
  sce: boolean
}
const NO_FILTERS: Filters = { type: null, redundancy: null, sce: false }

interface AssetsStepProps {
  ws: WorkspaceDetail
  /** Keeps the step open after it turns done, so adding the first asset does not fold the table away. */
  onKeepOpen: () => void
  /** Offered at the foot of the step once it is done. */
  next?: { label: string; onClick: () => void }
}

export function AssetsStep({ ws, onKeepOpen, next }: AssetsStepProps) {
  const qc = useQueryClient()
  const key = ['assets', ws.id]
  const assets = useQuery({ queryKey: key, queryFn: () => api.assets(ws.id) })
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [adding, setAdding] = useState(false)
  const [toDelete, setToDelete] = useState<Asset | null>(null)
  const [toImport, setToImport] = useState<File | null>(null)
  const [importError, setImportError] = useState<{ file: string; message: string; problems: string[] } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  function flashOnce(target: string) {
    window.clearTimeout(flashTimer.current)
    setFlash(target)
    flashTimer.current = window.setTimeout(() => setFlash(null), 1200)
  }

  function showAll() {
    setQuery('')
    setFilters(NO_FILTERS)
  }

  function settle() {
    qc.invalidateQueries({ queryKey: ['assets', ws.id] })
    qc.invalidateQueries({ queryKey: ['workspace', ws.id] })
    qc.invalidateQueries({ queryKey: ['workspaces'] })
  }

  const edit = useMutation({
    mutationFn: ({ equipmentId, patch }: { equipmentId: string; patch: AssetPatch }) => api.editAsset(ws.id, equipmentId, patch),
    onMutate: async ({ equipmentId, patch }) => {
      await qc.cancelQueries({ queryKey: ['assets', ws.id] })
      const previous = qc.getQueryData<AssetsResponse>(['assets', ws.id])
      if (previous)
        qc.setQueryData<AssetsResponse>(['assets', ws.id], {
          ...previous,
          assets: previous.assets.map((a) => (a.equipment_id === equipmentId ? { ...a, ...patch } : a)),
        })
      return { previous }
    },
    onError: (error, { equipmentId }, context) => {
      if (context?.previous) qc.setQueryData(['assets', ws.id], context.previous)
      toast.error(`Could not save ${equipmentId}. ${sentence(error.message)}`)
    },
    onSuccess: (data, { equipmentId, patch }) => {
      qc.setQueryData(['assets', ws.id], data)
      flashOnce(`${equipmentId}:${Object.keys(patch)[0]}`)
    },
    onSettled: settle,
  })

  const add = useMutation({
    mutationFn: (asset: AssetInput) => api.addAsset(ws.id, asset),
    onSuccess: (data, asset) => {
      qc.setQueryData(['assets', ws.id], data)
      setAdding(false)
      showAll()
      onKeepOpen()
      flashOnce(`${asset.equipment_id}:*`)
      requestAnimationFrame(() => document.getElementById(`asset-${asset.equipment_id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
      toast.success(`Added ${asset.equipment_id}.`)
    },
    onSettled: settle,
  })

  const remove = useMutation({
    mutationFn: (equipmentId: string) => api.deleteAsset(ws.id, equipmentId),
    onSuccess: (data, equipmentId) => {
      qc.setQueryData(['assets', ws.id], data)
      setToDelete(null)
      toast.success(`Deleted ${equipmentId}.`)
    },
    onError: (error, equipmentId) => toast.error(`Could not delete ${equipmentId}. ${sentence(error.message)}`),
    onSettled: settle,
  })

  const importer = useMutation({
    mutationFn: (file: File) => api.importAssets(ws.id, file),
    onSuccess: (data, file) => {
      qc.setQueryData(['assets', ws.id], data)
      setToImport(null)
      setImportError(null)
      showAll()
      onKeepOpen()
      toast.success(`Imported ${count(data.summary.count, 'asset')} from ${file.name}.`)
    },
    onError: (error, file) => {
      setToImport(null)
      setImportError({ file: file.name, message: error.message, problems: problemsOf(error) })
    },
    onSettled: settle,
  })

  function chooseImport(file: File) {
    setImportError(null)
    if ((assets.data?.summary.count ?? 0) > 0) setToImport(file)
    else importer.mutate(file)
  }

  if (assets.isPending) return <LoadingRows rows={6} />
  if (assets.isError) return <Notice kind="danger">The assets did not load. {sentence(assets.error.message)}</Notice>

  const { summary } = assets.data
  const list = assets.data.assets
  const q = query.trim().toLowerCase()
  const shown = list.filter(
    (a) =>
      (!q || [a.equipment_id, a.equipment_type, a.service_description, a.engineer_comment].some((v) => v.toLowerCase().includes(q))) &&
      (!filters.type || a.equipment_type === filters.type) &&
      (!filters.redundancy || a.redundancy === filters.redundancy) &&
      (!filters.sce || a.safety_critical_element),
  )
  const narrowed = !!(q || filters.type || filters.redundancy || filters.sce)

  const approved = ws.approved
  const uncoveredTypes = new Set<string>()
  const uncoveredRedundancy = new Set<string>()
  for (const message of approved?.coverage.errors ?? []) {
    const gap = gapOf(message)
    if (gap.kind === 'type') uncoveredTypes.add(gap.value)
    if (gap.kind === 'redundancy') uncoveredRedundancy.add(gap.value)
  }
  const types = summary.equipment_types.map((t) => t.name)
  const redundancies = summary.redundancy_values.map((r) => r.value)

  const addError = add.error
    ? add.error instanceof ApiError && add.error.status === 409
      ? `${sentence(add.error.message)} Edit that row instead, or use another id.`
      : `Could not add the asset. ${sentence(add.error.message)}`
    : null

  const fileInputEl = (
    <input
      ref={fileInput}
      type="file"
      accept={ACCEPT}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) chooseImport(file)
      }}
    />
  )

  const importNotice = importError && (
    <Notice kind="danger" className="grid gap-1.5">
      <p className="font-bold">
        Could not import {importError.file}. {sentence(importError.message)}
      </p>
      {importError.problems.length > 0 && (
        <ul className="grid list-disc gap-0.5 pl-5">
          {importError.problems.slice(0, 12).map((p, i) => (
            <li key={i}>{sentence(p)}</li>
          ))}
          {importError.problems.length > 12 && <li>{count(importError.problems.length - 12, 'more problem')}.</li>}
        </ul>
      )}
      <p>Fix {importError.problems.length === 1 ? 'that row' : 'these rows'} in the file and import it again. The current assets are unchanged.</p>
      <div>
        <Button variant="ghost" size="sm" className="-ml-2.5 text-destructive" onClick={() => setImportError(null)}>
          Dismiss
        </Button>
      </div>
    </Notice>
  )

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <datalist id={TYPE_LIST}>
        {types.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <datalist id={REDUNDANCY_LIST}>
        {redundancies.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      {fileInputEl}
      {importNotice}

      {list.length === 0 ? (
        <DropZone
          title="Drop the equipment registry CSV here"
          description={
            <>
              One row per asset, with the columns <span className="font-mono text-xs break-words text-foreground">{COLUMNS}</span>. Or add assets one
              by one.
            </>
          }
          accept={ACCEPT}
          kind="a CSV file"
          busy={importer.isPending}
          onFile={chooseImport}
          onReject={(message) => setImportError({ file: 'the file', message, problems: [] })}
          actions={
            <Button variant="outline" className={cn(outline, 'max-sm:h-11 max-sm:flex-1')} onClick={() => setAdding(true)}>
              <PlusIcon data-icon="inline-start" />
              Add asset
            </Button>
          }
        />
      ) : (
        <>
          {uncoveredTypes.size + uncoveredRedundancy.size > 0 && (
            <div role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
              <Bad>Approved rules v{approved?.version} do not cover</Bad>
              {[...uncoveredTypes].map((t) => (
                <Chip key={t} className="border-destructive font-medium text-destructive">
                  <XIcon className="size-3" />
                  {t}
                </Chip>
              ))}
              {[...uncoveredRedundancy].map((r) => (
                <Chip key={r} className="border-destructive font-mono font-medium text-destructive">
                  <XIcon className="size-3" />
                  {r}
                </Chip>
              ))}
              <span className="text-muted-foreground">Extract again in step 3 before submitting findings.</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-48 sm:max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find an asset"
                aria-label="Find assets by id, type, service or comment"
                className="bg-card pl-8 max-sm:h-11"
              />
            </div>
            <FacetMenu
              label="Type"
              plural="equipment types"
              value={filters.type}
              options={summary.equipment_types.map((t) => ({ value: t.name, count: t.count, gap: uncoveredTypes.has(t.name) }))}
              onChange={(type) => setFilters((f) => ({ ...f, type }))}
            />
            <FacetMenu
              label="Redundancy"
              plural="redundancy strings"
              mono
              value={filters.redundancy}
              options={summary.redundancy_values.map((r) => ({ value: r.value, count: r.count, gap: uncoveredRedundancy.has(r.value) }))}
              onChange={(redundancy) => setFilters((f) => ({ ...f, redundancy }))}
            />
            <Button
              variant="outline"
              aria-pressed={filters.sce}
              title="Safety critical elements only"
              className={cn(outline, 'max-sm:h-11', filters.sce && 'bg-muted')}
              onClick={() => setFilters((f) => ({ ...f, sce: !f.sce }))}
            >
              SCE
              <span className="text-muted-foreground tabular-nums">{summary.safety_critical}</span>
            </Button>
            <div className="flex gap-2 max-sm:w-full sm:ml-auto">
              <Button variant="outline" className={cn(outline, 'max-sm:h-11 max-sm:flex-1')} onClick={() => fileInput.current?.click()} disabled={importer.isPending}>
                <FileSpreadsheetIcon data-icon="inline-start" />
                {importer.isPending ? 'Importing' : 'Import CSV'}
              </Button>
              <Button className="max-sm:h-11 max-sm:flex-1" onClick={() => setAdding(true)}>
                <PlusIcon data-icon="inline-start" />
                Add asset
              </Button>
            </div>
          </div>

          {narrowed && (
            <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground" role="status">
              <span>
                {shown.length} of {count(list.length, 'asset')} shown.
              </span>
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={showAll}>
                Show all
              </button>
            </p>
          )}
          {shown.length > 0 ? (
            <AssetTable
              assets={shown}
              flash={flash}
              typeListId={TYPE_LIST}
              redundancyListId={REDUNDANCY_LIST}
              onSave={(asset, patch) => edit.mutate({ equipmentId: asset.equipment_id, patch })}
              onDelete={setToDelete}
            />
          ) : (
            <Empty
              action={
                <Button variant="outline" className={outline} onClick={showAll}>
                  Show all
                </Button>
              }
            >
              No assets match.
            </Empty>
          )}

          {next && (
            <div className="flex justify-end pt-1">
              <Button onClick={next.onClick} className="max-sm:h-11 max-sm:w-full">
                {next.label}
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog
        open={adding}
        onOpenChange={(open) => {
          setAdding(open)
          if (!open) add.reset()
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:max-w-2xl">
          <AssetForm
            existingIds={new Set(list.map((a) => a.equipment_id))}
            types={types}
            redundancies={redundancies}
            approvedVersion={approved?.version ?? null}
            typeListId={TYPE_LIST}
            redundancyListId={REDUNDANCY_LIST}
            pending={add.isPending}
            error={addError}
            onSubmit={(asset) => add.mutate(asset)}
            onCancel={() => setAdding(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-md font-bold">Delete {toDelete?.equipment_id}?</DialogTitle>
            <DialogDescription>
              It leaves the assets at once. A findings file that names {toDelete?.equipment_id} is blocked until you add it again. Approved rules stay
              approved, and past processes keep their tickets.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className={outline} onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete.equipment_id)}>
              Delete {toDelete?.equipment_id}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toImport} onOpenChange={(open) => !open && setToImport(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-md font-bold">Replace all {count(summary.count, 'asset')}?</DialogTitle>
            <DialogDescription>
              Every asset is replaced by the rows in {toImport?.name}, including edited engineer comments. Approved rules stay approved, and go out of
              date if the file adds an equipment type or a redundancy string.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className={outline} onClick={() => setToImport(null)}>
              Cancel
            </Button>
            <Button disabled={importer.isPending} onClick={() => toImport && importer.mutate(toImport)}>
              {importer.isPending ? 'Importing' : `Replace ${count(summary.count, 'asset')}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface FacetOption {
  value: string
  count: number
  /** Not covered by the approved rules: marked in red, like the step header. */
  gap: boolean
}

/** One vocabulary of the registry as a filter: the values, how many assets carry each, and any coverage gap. */
function FacetMenu({
  label,
  plural,
  value,
  options,
  mono = false,
  onChange,
}: {
  label: string
  plural: string
  value: string | null
  options: FacetOption[]
  mono?: boolean
  onChange: (value: string | null) => void
}) {
  const gaps = options.filter((o) => o.gap).length
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn(outline, 'max-w-[16rem] max-sm:h-11', value && 'bg-muted', gaps > 0 && !value && 'text-destructive')}>
          <span className="truncate">
            {value ? (
              <>
                {label}: <span className={cn(mono && 'font-mono text-xs')}>{value}</span>
              </>
            ) : (
              <>
                {label} <span className={cn('tabular-nums', gaps > 0 ? 'text-destructive' : 'text-muted-foreground')}>{options.length}</span>
                {gaps > 0 && (
                  <>
                    <CircleAlertIcon className="ml-1 inline size-3.5 align-[-2px] text-destructive" aria-hidden />
                    <span className="sr-only">, {gaps} not covered by the rules</span>
                  </>
                )}
              </>
            )}
          </span>
          <ChevronDownIcon data-icon="inline-end" className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60vh] w-72 overflow-y-auto">
        <DropdownMenuLabel className="text-muted-foreground">
          {count(options.length, plural.slice(0, -1), plural)}
          {gaps > 0 && <span className="text-destructive">, {count(gaps, 'gap')} in the rules</span>}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value ?? ''} onValueChange={(v) => onChange(v || null)}>
          <DropdownMenuRadioItem value="">All</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className={cn(o.gap && 'text-destructive')}>
              <span className={cn('min-w-0 flex-1 truncate', mono && 'font-mono text-xs')}>{o.value}</span>
              {o.gap && <XIcon className="size-3 shrink-0" />}
              <span className="text-muted-foreground tabular-nums">{o.count}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
