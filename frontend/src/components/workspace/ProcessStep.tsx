import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheetIcon, PlayIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { api, formatDate, type FindingRecord, type FindingsPreview, type WorkspaceDetail } from '@/api'
import { Bad, Empty, LoadingRows, Note, Notice, Ok, StatusBadge, Tag } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { DropZone } from './DropZone'
import { LiveProcess } from './LiveProcess'
import { calendarDate, count, fileSize, firstLine, problemsOf, sentence } from './format'
import { SubHeading } from './parts'
import { outline, tbody, td, th } from './styles'

const ACCEPT = '.csv,text/csv'
const COLUMNS = 'finding_id, reported_date, equipment_id, equipment_type, inspection_type, inspection_method, finding_description, reported_by, reporter_role'

interface ProcessStepProps {
  ws: WorkspaceDetail
  assessModel?: string
  fakeModel?: boolean
  apiKey?: boolean
  workers?: number
}

type RowCheck = { kind: 'blocks'; text: string } | { kind: 'info'; text: string } | null

function rowChecks(preview: FindingsPreview): Map<string, RowCheck> {
  const out = new Map<string, RowCheck>()
  for (const m of preview.type_mismatches)
    out.set(m.finding_id, { kind: 'info', text: `The file says ${m.finding_type}, the assets say ${m.asset_type}. The asset type is used.` })
  for (const u of preview.unknown_equipment)
    out.set(u.finding_id, { kind: 'blocks', text: `${u.equipment_id} is not in the assets. Add it in step 2 or correct the file.` })
  return out
}

export function ProcessStep({ ws, assessModel, fakeModel, apiKey, workers }: ProcessStepProps) {
  const qc = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [rejected, setRejected] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)

  const preview = useMutation({ mutationFn: (f: File) => api.previewFindings(ws.id, f) })
  const bravo = useMutation({
    mutationFn: api.bravoFindings,
    onSuccess: (f) => choose(f),
  })
  const submit = useMutation({
    mutationFn: ({ f, rulesVersionId }: { f: File; rulesVersionId: string }) => api.submitProcess(ws.id, f, rulesVersionId),
    onSuccess: (process) => {
      qc.setQueryData(['process', process.id], process)
      qc.invalidateQueries({ queryKey: ['workspace', ws.id] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      setFile(null)
      preview.reset()
      setPlanId(process.id)
    },
  })

  function choose(f: File) {
    setRejected(null)
    submit.reset()
    setFile(f)
    preview.mutate(f)
  }

  function clear() {
    setFile(null)
    preview.reset()
    submit.reset()
  }

  const approvedVersions = ws.rules_versions.filter((v) => v.status === 'approved')
  // A process found running on load stays on screen after it finishes, until dismissed.
  const runningProcess = ws.processes.find((proc) => proc.status === 'running')
  const [seen, setSeen] = useState<string | null>(null)
  if (runningProcess && runningProcess.id !== seen) setSeen(runningProcess.id)
  const liveId = planId ?? (seen && seen !== dismissed ? seen : null)
  const rulesVersion = approvedVersions.find((v) => v.id === picked) ?? approvedVersions[0]
  const p = preview.data

  let blocked: string | null = null
  if (p) {
    if (p.problems.length) blocked = `Fix the ${p.problems.length === 1 ? 'problem' : `${p.problems.length} problems`} in the file, then choose it again.`
    else if (p.unknown_equipment.length) {
      const [first, ...rest] = p.unknown_equipment
      blocked = `Fix ${first.finding_id} to submit. ${first.equipment_id} is not in the assets.${rest.length ? ` ${count(rest.length, 'more row')} ${rest.length === 1 ? 'has' : 'have'} the same problem.` : ''}`
    } else if (fakeModel === false && apiKey === false) blocked = 'No ANTHROPIC_API_KEY is set and the fake model is off. Put the key in backend/.env and restart the backend.'
    else if (!rulesVersion) blocked = 'Approve a rules version in step 3 first.'
    else if (ws.approved && rulesVersion.id === ws.approved.id && !ws.approved.coverage.ok)
      blocked = `Approved rules v${ws.approved.version} do not cover the current assets. Extract again in step 3.`
    else if (!p.ok) blocked = 'The file cannot be processed as it is. Choose another file.'
  }

  const submitError = submit.error
    ? [`Could not submit. ${sentence(submit.error.message)}`, ...problemsOf(submit.error).map(sentence)].join(' ')
    : null

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        {rejected && <Notice kind="danger">{rejected}</Notice>}
        {bravo.isError && <Notice kind="danger">The Bravo example findings did not load. {sentence(bravo.error.message)}</Notice>}

        {liveId ? (
          <LiveProcess
            processId={liveId}
            onDismiss={() => {
              setDismissed(liveId)
              setPlanId(null)
            }}
          />
        ) : !file ? (
          <>
            {ws.approved && !ws.approved.coverage.ok && (
              <Notice kind="danger">Approved rules v{ws.approved.version} do not cover the current assets. Extract again in step 3 before submitting findings.</Notice>
            )}
            <DropZone
            title="Drop an inspection findings CSV"
            description={
              <>
                Columns are fixed: <span className="font-mono text-xs break-words text-foreground">{COLUMNS}</span>. Rows are checked against the assets before
                anything is sent to the model.
              </>
            }
            accept={ACCEPT}
            kind="a CSV file"
            busy={bravo.isPending}
            onFile={choose}
            onReject={setRejected}
            actions={
              <Button variant="outline" className={cn(outline, 'max-sm:h-11')} onClick={() => bravo.mutate()} disabled={bravo.isPending}>
                {bravo.isPending ? 'Loading the Bravo example' : 'Use the Bravo example findings'}
              </Button>
            }
          />
          </>
        ) : (
          <section aria-labelledby="process-file" className="panel overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
              <span className="flex min-w-0 items-center gap-2 font-bold">
                <FileSpreadsheetIcon className="size-5 shrink-0 text-muted-foreground" />
                <span id="process-file" className="break-all">
                  {file.name}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">
                {p ? `${count(p.rows, 'row')}, ` : ''}
                {fileSize(file.size)}
              </span>
              <div className="flex gap-2 sm:ml-auto">
                <ReplaceButton onFile={choose} onReject={setRejected} />
                <Button variant="ghost" onClick={clear}>
                  Remove
                </Button>
              </div>
            </div>

            {preview.isPending && <LoadingRows rows={5} className="p-4" />}
            {preview.isError && (
              <div className="p-4">
                <Notice kind="danger">
                  Could not read {file.name}. {sentence(preview.error.message)} Save it as UTF-8 CSV and choose it again.
                </Notice>
              </div>
            )}
            {p && <Preview preview={p} />}

            {p && (
              <div className="border-t border-border px-4 py-4">
                <div className="grid items-center gap-x-5 gap-y-3 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_auto]">
                  <Label htmlFor="process-rules" className="sr-only">
                    Rules version
                  </Label>
                  {approvedVersions.length > 0 ? (
                    <Select value={rulesVersion?.id} onValueChange={setPicked}>
                      <SelectTrigger id="process-rules" className="h-9 w-full bg-card max-sm:h-11">
                        <span className="text-muted-foreground">Rules</span>
                        <SelectValue placeholder="Choose an approved version" />
                      </SelectTrigger>
                      <SelectContent>
                        {approvedVersions.map((v, i) => (
                          <SelectItem key={v.id} value={v.id}>
                            <span className="font-semibold tabular-nums">v{v.version}</span>
                            <span className="text-muted-foreground">
                              created {formatDate(v.created_at)}
                              {approvedVersions.length > 1 ? (i === 0 ? ', latest' : ', superseded') : ''}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">No approved rules version yet.</p>
                  )}
                  <p className={cn('text-sm', blocked ? 'font-medium text-destructive' : 'text-muted-foreground')} role="status">
                    {blocked ??
                      `${count(p.rows, 'finding')} become ${count(p.rows, 'ticket')}${fakeModel ? ', drafted by the fake model' : assessModel ? `, drafted by ${assessModel}` : ''}${workers ? ` on ${count(workers, 'worker')}` : ''}.`}
                  </p>
                  <Button
                    disabled={!!blocked || !rulesVersion || submit.isPending}
                    onClick={() => rulesVersion && submit.mutate({ f: file, rulesVersionId: rulesVersion.id })}
                    className="max-sm:h-11 max-sm:w-full"
                  >
                    <PlayIcon data-icon="inline-start" />
                    {submit.isPending ? 'Submitting' : 'Submit process'}
                  </Button>
                </div>
                {submitError && (
                  <Notice kind="danger" className="mt-3">
                    {submitError}
                  </Notice>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      <ProcessesTable ws={ws} />
    </div>
  )
}

function ReplaceButton({ onFile, onReject }: { onFile: (f: File) => void; onReject: (message: string) => void }) {
  return (
    <Button variant="outline" className={outline} asChild>
      <label className="cursor-pointer rounded-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
        Replace file
        <input
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') onReject(`${f.name} is not a CSV file. Choose a CSV file instead.`)
            else onFile(f)
          }}
        />
      </label>
    </Button>
  )
}

function Preview({ preview: p }: { preview: FindingsPreview }) {
  const checks = rowChecks(p)
  const rank = (f: FindingRecord) => (checks.get(f.finding_id)?.kind === 'blocks' ? 0 : checks.get(f.finding_id) ? 1 : 2)
  const rows = p.findings.map((f, i) => [f, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
  const matching = p.rows - p.unknown_equipment.length
  const anyCheck = checks.size > 0

  return (
    <>
      <div role="status" className="flex flex-wrap gap-x-8 gap-y-2 border-b border-border px-4 py-3">
        {p.problems.length > 0 && (
          <div className="grid gap-1">
            <Bad>
              <b>{count(p.problems.length, 'problem')} in the file</b> block the submit.
            </Bad>
            <ul className="grid list-disc gap-0.5 pl-10 text-sm text-destructive">
              {p.problems.slice(0, 8).map((problem, i) => (
                <li key={i}>{sentence(problem)}</li>
              ))}
              {p.problems.length > 8 && <li>{count(p.problems.length - 8, 'more problem')}.</li>}
            </ul>
          </div>
        )}
        {p.unknown_equipment.length > 0 && (
          <Bad>
            <b>
              {count(p.unknown_equipment.length, 'row')} {p.unknown_equipment.length === 1 ? 'references' : 'reference'} unknown equipment
            </b>
            <span className="block text-muted-foreground">It blocks the submit.</span>
          </Bad>
        )}
        {p.type_mismatches.length > 0 && (
          <Note>
            <b className="text-foreground">
              {count(p.type_mismatches.length, 'type')} {p.type_mismatches.length === 1 ? 'differs' : 'differ'} from the assets
            </b>
            <span className="block">Information only; the asset type is used.</span>
          </Note>
        )}
        {p.rows > 0 && !p.problems.length && (
          <Ok>
            <b>
              {matching === p.rows ? `${p.rows} of ${p.rows}` : matching} {matching === 1 ? 'row matches' : 'rows match'} the assets
            </b>
            {matching === p.rows && !p.type_mismatches.length && <span className="block text-muted-foreground">No unknown equipment, no type differences.</span>}
          </Ok>
        )}
      </div>

      {rows.length > 0 ? (
        <div className="max-h-[27rem] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Findings in the file, rows with a problem first</caption>
            <thead className="sticky top-0 z-10">
              <tr>
                <th scope="col" className={th}>
                  Finding
                </th>
                <th scope="col" className={th}>
                  Reported
                </th>
                <th scope="col" className={th}>
                  Equipment
                </th>
                <th scope="col" className={th}>
                  Description
                </th>
                <th scope="col" className={th}>
                  Reported by
                </th>
                {anyCheck && (
                  <th scope="col" className={th}>
                    Check
                  </th>
                )}
              </tr>
            </thead>
            <tbody className={tbody}>
              {rows.map(([f]) => {
                const check = checks.get(f.finding_id)
                return (
                  <tr key={f.finding_id}>
                    <td className={cn(td, 'font-bold whitespace-nowrap', check?.kind === 'blocks' && 'shadow-[inset_3px_0_0_var(--destructive)]')}>{f.finding_id}</td>
                    <td className={cn(td, 'whitespace-nowrap')}>{calendarDate(f.reported_date)}</td>
                    <td className={cn(td, 'whitespace-nowrap')}>
                      <Tag className="text-base">{f.equipment_id}</Tag>
                      <span className="block text-xs text-muted-foreground">{f.equipment_type}</span>
                    </td>
                    <td className={cn(td, 'min-w-[16rem]')}>
                      <p className="line-clamp-2 max-w-[38rem] text-muted-foreground" title={f.finding_description}>
                        {f.finding_description}
                      </p>
                    </td>
                    <td className={cn(td, 'min-w-[10rem]')}>
                      {f.reporter_role}
                      <span className="block text-xs text-muted-foreground">{f.reported_by}</span>
                    </td>
                    {anyCheck && (
                      <td className={cn(td, 'min-w-[14rem]')}>
                        {check?.kind === 'blocks' && <Bad className="text-xs font-bold">{check.text}</Bad>}
                        {check?.kind === 'info' && <Note className="text-xs text-foreground">{check.text}</Note>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground">The file has no rows to show.</p>
      )}
    </>
  )
}

function ProcessesTable({ ws }: { ws: WorkspaceDetail }) {
  const navigate = useNavigate()
  const processes = ws.processes
  const versionOf = (id: string, fallback: number | null) => fallback ?? ws.rules_versions.find((v) => v.id === id)?.version
  return (
    <section aria-labelledby="process-list">
      <SubHeading id="process-list" aside={<span className="text-sm text-muted-foreground">{count(processes.length, 'process', 'processes')}</span>}>
        Processes
      </SubHeading>
      {processes.length === 0 ? (
        <Empty className="py-4">No processes yet. Submit a findings file above to draft the first tickets.</Empty>
      ) : (
        <div className="panel relative overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Past processes, newest first</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Process
                </th>
                <th scope="col" className={th}>
                  Status
                </th>
                <th scope="col" className={cn(th, 'text-right')}>
                  Drafted
                </th>
                <th scope="col" className={cn(th, 'text-right')}>
                  Findings
                </th>
                <th scope="col" className={th}>
                  File
                </th>
                <th scope="col" className={th}>
                  Rules
                </th>
                <th scope="col" className={th}>
                  Started
                </th>
              </tr>
            </thead>
            <tbody className={tbody}>
              {processes.map((proc) => {
                const finished = proc.counts.done + proc.counts.failed
                const version = versionOf(proc.rules_version_id, proc.rules_version)
                return (
                  <tr key={proc.id} className="cursor-pointer transition-colors hover:bg-muted/60" onClick={() => navigate(`/p/${proc.id}`)}>
                    <td className={cn(td, 'whitespace-nowrap')}>
                      <Link to={`/p/${proc.id}`} className="font-bold text-foreground hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        Process {proc.number}
                      </Link>
                    </td>
                    <td className={cn(td, 'min-w-[8rem]')}>
                      <StatusBadge status={proc.status} />
                      {proc.status === 'failed' && proc.error && (
                        <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground" title={proc.error}>
                          {sentence(firstLine(proc.error))}
                        </span>
                      )}
                    </td>
                    <td className={cn(td, 'text-right whitespace-nowrap tabular-nums')}>
                      <span className="font-bold">{finished}</span> of {proc.total}
                      {proc.counts.failed > 0 && <span className="block text-xs text-destructive">{proc.counts.failed} failed</span>}
                    </td>
                    <td className={cn(td, 'text-right tabular-nums')}>{proc.findings_count}</td>
                    <td className={cn(td, 'max-w-[14rem] break-all text-muted-foreground')}>{proc.filename ?? <span className="text-muted-foreground">Unknown</span>}</td>
                    <td className={cn(td, 'whitespace-nowrap')}>{version != null ? `v${version}` : <span className="text-muted-foreground">Unknown</span>}</td>
                    <td className={cn(td, 'whitespace-nowrap text-muted-foreground')}>{formatDate(proc.started_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
