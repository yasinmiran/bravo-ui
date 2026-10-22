import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api, ApiError, formatDate, type WorkspaceDetail } from '@/api'
import { LoadingRows, Notice, PageTitle } from '@/components/marks'
import { Crumbs } from '@/components/Shell'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { AssetsStep } from '@/components/workspace/AssetsStep'
import { count, sentence } from '@/components/workspace/format'
import { KnowledgeStep } from '@/components/workspace/KnowledgeStep'
import { ProcessStep } from '@/components/workspace/ProcessStep'
import { RulesStep } from '@/components/workspace/RulesStep'
import { Step, type StepState } from '@/components/workspace/Step'

type StepId = 'knowledge' | 'assets' | 'rules' | 'process'

const busy = (ws: WorkspaceDetail | undefined) =>
  !!ws && (ws.rules_versions.some((v) => v.status === 'extracting') || ws.processes.some((p) => p.status === 'running'))

/** Gating: each step waits for the one before it. Process opens on any approved version, so a stale one blocks submits but keeps past processes in view. */
function stepStates(ws: WorkspaceDetail): Record<StepId, StepState> {
  const knowledge: StepState = ws.document ? 'done' : 'current'
  const assets: StepState = !ws.document ? 'locked' : ws.assets.count > 0 ? 'done' : 'current'
  const rules: StepState = assets !== 'done' ? 'locked' : !ws.approved ? 'current' : ws.approved.coverage.ok ? 'done' : 'stale'
  const process: StepState = rules === 'locked' || !ws.approved ? 'locked' : 'current'
  return { knowledge, assets, rules, process }
}

function rulesSummary(ws: WorkspaceDetail): string {
  if (!ws.approved) return ''
  const gaps = ws.approved.coverage.errors.length
  const parts = [gaps ? `v${ws.approved.version} approved, out of date: ${count(gaps, 'gap')} since the assets changed.` : `v${ws.approved.version} approved, covers the current assets.`]
  const draft = ws.rules_versions.find((v) => v.status === 'draft' && v.version > ws.approved!.version)
  const extracting = ws.rules_versions.find((v) => v.status === 'extracting')
  if (extracting) parts.push(`v${extracting.version} is extracting.`)
  else if (draft) parts.push(`v${draft.version} is a draft waiting for review.`)
  return parts.join(' ')
}

export function WorkspacePage() {
  const { workspaceId = '' } = useParams()
  const [opened, setOpened] = useState<Partial<Record<StepId, boolean>>>({})
  const workspace = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.workspace(workspaceId),
    refetchInterval: (query) => (busy(query.state.data) ? 1500 : false),
  })
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: Infinity })

  const ws = workspace.data
  const crumb = (
    <Crumbs>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{ws?.name ?? 'Workspace'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </Crumbs>
  )

  if (workspace.isPending)
    return (
      <>
        {crumb}
        <LoadingRows rows={6} className="max-w-5xl" />
      </>
    )

  if (workspace.isError) {
    const missing = workspace.error instanceof ApiError && workspace.error.status === 404
    return (
      <>
        {crumb}
        <div className="grid max-w-2xl justify-items-start gap-3">
          <Notice kind="danger">
            {missing
              ? 'This workspace does not exist. It may have been deleted; pick another one from the list.'
              : `The workspace did not load. ${sentence(workspace.error.message)} Check that the backend is running, then reload.`}
          </Notice>
          <Button asChild variant="outline">
            <Link to="/">Back to workspaces</Link>
          </Button>
        </div>
      </>
    )
  }

  const data = workspace.data
  const states = stepStates(data)
  const isOpen = (id: StepId) => states[id] === 'current' || states[id] === 'stale' || (states[id] === 'done' && !!opened[id])
  const toggle = (id: StepId) => setOpened((o) => ({ ...o, [id]: !isOpen(id) }))
  const doc = data.document
  const assetSummary = data.assets

  function closeAssets() {
    setOpened((o) => ({ ...o, assets: false }))
    document.getElementById('step-assets')?.scrollIntoView({ block: 'start' })
  }

  return (
    <div className="mx-auto grid w-full gap-8 md:max-w-[max(70%,52rem)]">
      {crumb}
      <PageTitle>{data.name}</PageTitle>

      <ol className="grid min-w-0" aria-label="Workspace steps">
        <li id="step-knowledge" className="scroll-mt-16">
          <Step
            id="knowledge"
            n={1}
            title="Knowledge"
            state={states.knowledge}
            open={isOpen('knowledge')}
            next={states.assets}
            onToggle={() => toggle('knowledge')}
            lockedReason=""
            description="The handover notes or procedure the rules are extracted from. One document per workspace."
            summary={doc && `${doc.filename}, ${count(doc.sections, 'section')}, added ${formatDate(doc.uploaded_at)}.`}
          >
            <KnowledgeStep ws={data} />
          </Step>
        </li>
        <li id="step-assets" className="scroll-mt-16">
          <Step
            id="assets"
            n={2}
            title="Assets"
            state={states.assets}
            open={isOpen('assets')}
            next={states.rules}
            onToggle={() => toggle('assets')}
            lockedReason="Add the knowledge document in step 1 to unlock."
            description="The equipment registry. Findings are checked against it, and the rules are written for its equipment types."
            summary={`${count(assetSummary.count, 'asset')}, ${assetSummary.safety_critical} safety critical.`}
          >
            <AssetsStep
              ws={data}
              onKeepOpen={() => setOpened((o) => ({ ...o, assets: true }))}
              next={
                states.assets === 'done'
                  ? { label: states.rules === 'done' ? 'Continue to process' : 'Continue to rules', onClick: closeAssets }
                  : undefined
              }
            />
          </Step>
        </li>
        <li id="step-rules" className="scroll-mt-16">
          <Step
            id="rules"
            n={3}
            title="Rules"
            state={states.rules}
            open={isOpen('rules')}
            next={states.process}
            onToggle={() => toggle('rules')}
            lockedReason={
              !doc ? 'Add the knowledge document and at least one asset to unlock.' : 'Add at least one asset in step 2 to unlock.'
            }
            description="One model call writes the rules from the document and the engineer comments. Approve a version to use it."
            summary={rulesSummary(data)}
          >
            <RulesStep ws={data} extractModel={health.data?.extract_model} />
          </Step>
        </li>
        <li id="step-process" className="scroll-mt-16">
          <Step
            id="process"
            n={4}
            title="Process"
            state={states.process}
            open={isOpen('process')}
            lockedReason="Approve a rules version in step 3 to unlock."
            description="Findings are not stored on the workspace. Each file you submit becomes a process that drafts one ticket per finding."
            summary=""
          >
            <ProcessStep ws={data} assessModel={health.data?.assess_model} fakeModel={health.data?.fake_model} apiKey={health.data?.api_key} workers={health.data?.workers} />
          </Step>
        </li>
      </ol>
    </div>
  )
}
