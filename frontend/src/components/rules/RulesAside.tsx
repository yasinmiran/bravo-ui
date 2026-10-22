import { CheckIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { formatDate, type RulesDetail, type RulesVersionSummary } from '@/api'
import { Bad, Note, Notice, Ok, StatusBadge } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { count, versionLine } from './format'

const heading = 'text-md font-bold'

export function ApprovalCard({
  detail,
  workspaceId,
  onApprove,
  approving,
  error,
  justApproved,
  unsaved,
}: {
  detail: RulesDetail
  workspaceId: string
  onApprove: () => void
  approving: boolean
  error: string | null
  justApproved: boolean
  unsaved: boolean
}) {
  const v = detail.version
  const approved = detail.status === 'approved'
  return (
    <section
      aria-labelledby="approve-h"
      className={cn(
        'rounded-xl border p-5 transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]',
        approved ? 'border-ok/20 bg-ok/10' : 'border-border bg-card',
      )}
    >
      {approved ? (
        <>
          <h2 id="approve-h" className={cn(heading, 'flex items-center gap-2 text-ok')}>
            <CheckIcon aria-hidden className="size-4" />v{v} approved
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {justApproved ? 'New processes can use it now.' : 'New processes can use it.'} This version was created {formatDate(detail.created_at)}.
          </p>
          <Button asChild variant={justApproved ? 'default' : 'outline'} className="mt-4 h-11 w-full text-base font-bold">
            <Link to={`/w/${workspaceId}`}>Continue on the workspace</Link>
          </Button>
        </>
      ) : detail.status === 'failed' ? (
        <FailedApproval detail={detail} workspaceId={workspaceId} />
      ) : (
        <>
          <h2 id="approve-h" className={heading}>
            Approve v{v}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {detail.status === 'extracting'
              ? 'The draft is still being extracted. Approve it once it is ready.'
              : 'New processes use the latest approved version. Processes already run keep their scores.'}
          </p>
          {detail.status === 'draft' && !detail.approvable && (
            <div className="mt-3 grid gap-1.5">
              <p className="text-sm font-medium text-foreground">Approve stays off until these are fixed:</p>
              <ul className="grid gap-1.5">
                {detail.coverage.errors.length ? (
                  detail.coverage.errors.map((e, i) => (
                    <li key={i}>
                      <Bad>{e}</Bad>
                    </li>
                  ))
                ) : (
                  <li>
                    <Bad>This version has no rules to approve.</Bad>
                  </li>
                )}
              </ul>
            </div>
          )}
          {unsaved && <Note className="mt-3">The YAML has unsaved changes. Approving approves v{v} as saved.</Note>}
          <Button className="mt-4 h-11 w-full text-base font-bold" disabled={detail.status !== 'draft' || !detail.approvable || approving} onClick={onApprove}>
            <CheckIcon data-icon="inline-start" />
            Approve v{v}
          </Button>
          {error && (
            <Notice kind="danger" className="mt-3">
              {error}
            </Notice>
          )}
        </>
      )}
    </section>
  )
}

function FailedApproval({ detail, workspaceId }: { detail: RulesDetail; workspaceId: string }) {
  const [first, ...rest] = (detail.error ?? 'No reason was recorded.').split('\n')
  const trace = rest.join('\n').trim()
  return (
    <>
      <h2 id="approve-h" className={heading}>
        Extraction failed
      </h2>
      <Bad className="mt-2 break-words">{first}</Bad>
      {trace && (
        <details className="mt-2 text-sm text-muted-foreground">
          <summary className="cursor-pointer">Details</summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap">{trace}</pre>
        </details>
      )}
      <p className="mt-3 text-sm text-muted-foreground">There is nothing to approve. Extract again from the workspace.</p>
      <Button asChild variant="outline" className="mt-3 h-11 w-full text-base font-bold">
        <Link to={`/w/${workspaceId}`}>Open the workspace</Link>
      </Button>
    </>
  )
}

export function CoverageCard({ detail }: { detail: RulesDetail }) {
  const { coverage, rules } = detail
  return (
    <section aria-labelledby="coverage-h">
      <h2 id="coverage-h" className={cn(heading, 'mb-3')}>
        Coverage
      </h2>
      {detail.status === 'extracting' ? (
        <Note>Checked against the assets once the draft is ready.</Note>
      ) : detail.status === 'failed' ? (
        <Note>No draft to check.</Note>
      ) : (
        <ul className="grid gap-3">
          {coverage.errors.map((e, i) => (
            <li key={`e${i}`}>
              <Bad className="break-words">{e}</Bad>
            </li>
          ))}
          {!coverage.errors.length && rules && (
            <li>
              <Ok>
                Covers all {count(Object.keys(rules.by_equipment_type).length, 'equipment type')} and{' '}
                {count(Object.keys(rules.redundancy_vocabulary).length, 'redundancy string')}
              </Ok>
            </li>
          )}
          {coverage.warnings.map((w, i) => (
            <li key={`w${i}`}>
              <Note className="break-words">{w}</Note>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function VersionsCard({ versions, currentId, workspaceId }: { versions: RulesVersionSummary[]; currentId: string; workspaceId: string }) {
  return (
    <section aria-labelledby="versions-h">
      <h2 id="versions-h" className={cn(heading, 'mb-2')}>
        Versions
      </h2>
      {versions.length ? (
        <ol className="grid">
          {versions.map((v) => {
            const current = v.id === currentId
            return (
              <li key={v.id} className="border-t border-border py-1">
                <Link
                  to={`/w/${workspaceId}/rules/${v.id}`}
                  aria-current={current ? 'page' : undefined}
                  className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 rounded-md px-2 py-2 transition-colors duration-100 hover:bg-muted aria-[current=page]:bg-card aria-[current=page]:shadow-[inset_0_0_0_1px_var(--border)]"
                >
                  <span className={cn('text-base font-[780] tabular-nums', current ? 'text-primary' : 'text-muted-foreground')}>v{v.version}</span>
                  <span className="grid justify-items-start gap-1">
                    <StatusBadge status={v.status} />
                    <span className="text-sm text-muted-foreground">{versionLine(v, versions)}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      ) : (
        <Note>No versions yet.</Note>
      )}
    </section>
  )
}
