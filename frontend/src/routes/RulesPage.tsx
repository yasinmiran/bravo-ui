import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { api, formatDate, type WorkspaceDetail } from '@/api'
import { Empty, LoadingRows, Note, Notice, StatusBadge } from '@/components/marks'
import { ExtractionLive } from '@/components/rules/ExtractionLive'
import { nextVersion, originLine } from '@/components/rules/format'
import { ApprovalCard, CoverageCard, VersionsCard } from '@/components/rules/RulesAside'
import { RulesDocument, SourceLegend } from '@/components/rules/RulesDocument'
import { RulesNav } from '@/components/rules/RulesNav'
import { allBullets, isInferred } from '@/components/rules/source'
import { YamlPanel } from '@/components/rules/YamlPanel'
import { Crumbs } from '@/components/Shell'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type Tab = 'doc' | 'yaml'

function RulesCrumbs({ workspaceId, name, version }: { workspaceId: string; name?: string; version?: number }) {
  return (
    <Crumbs>
      <Breadcrumb>
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbLink asChild className="truncate">
              <Link to={`/w/${workspaceId}`}>{name ?? 'Workspace'}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="whitespace-nowrap">{version ? `Rules v${version}` : 'Rules'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </Crumbs>
  )
}

export function RulesPage() {
  const { workspaceId = '', rulesId } = useParams()
  const workspace = useQuery({ queryKey: ['workspace', workspaceId], queryFn: () => api.workspace(workspaceId) })

  if (rulesId) return <RulesView key={rulesId} workspaceId={workspaceId} rulesId={rulesId} workspace={workspace.data} />
  if (workspace.isPending) return <LoadingRows rows={6} />
  if (workspace.isError) return <Notice kind="danger">{workspace.error.message}</Notice>
  const latest = workspace.data.rules_versions[0]
  if (latest) return <Navigate replace to={`/w/${workspaceId}/rules/${latest.id}`} />
  return (
    <>
      <RulesCrumbs workspaceId={workspaceId} name={workspace.data.name} />
      <Empty
        action={
          <Button asChild>
            <Link to={`/w/${workspaceId}`}>Open the workspace</Link>
          </Button>
        }
      >
        No rules yet. Extract rules on the workspace page, then review and approve the draft here.
      </Empty>
    </>
  )
}

/** Fades content in when it replaces other content after a person's action or a state change. */
function Swap({ animate, children }: { animate: boolean; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div initial={animate && !reduce ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}>
      {children}
    </motion.div>
  )
}

function RulesView({ workspaceId, rulesId, workspace }: { workspaceId: string; rulesId: string; workspace: WorkspaceDetail | undefined }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'yaml' ? 'yaml' : 'doc'
  const [animate, setAnimate] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [justApproved, setJustApproved] = useState(false)

  const rules = useQuery({
    queryKey: ['rules', rulesId],
    queryFn: () => api.rules(rulesId),
    refetchInterval: (q) => (q.state.data?.status === 'extracting' ? 1500 : false),
  })
  const detail = rules.data
  const status = detail?.status
  const versions = workspace?.rules_versions ?? []
  const dirty = draft !== null && detail?.yaml != null && draft !== detail.yaml

  // The workspace carries the versions list and the approved version; keep it in step with this one.
  const seenStatus = useRef(status)
  useEffect(() => {
    if (seenStatus.current && status && seenStatus.current !== status) {
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      setAnimate(true)
    }
    seenStatus.current = status
  }, [status, qc, workspaceId])

  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('Leave without saving? Your YAML changes will be lost.')) blocker.proceed()
    else blocker.reset()
  }, [blocker])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = useMutation({
    mutationFn: (yaml: string) => api.editRules(rulesId, yaml),
    onSuccess: (created) => {
      dirtyRef.current = false
      qc.setQueryData(['rules', created.id], created)
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      toast.success(`Saved as v${created.version}, a new draft`)
      navigate(`/w/${workspaceId}/rules/${created.id}`)
    },
  })
  const approve = useMutation({
    mutationFn: () => api.approveRules(rulesId),
    onSuccess: (approved) => {
      qc.setQueryData(['rules', rulesId], approved)
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      setJustApproved(true)
    },
  })

  const setTab = useCallback(
    (next: Tab) => {
      setAnimate(true)
      setParams(
        (p) => {
          const q = new URLSearchParams(p)
          if (next === 'yaml') q.set('tab', 'yaml')
          else q.delete('tab')
          return q
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const jump = useCallback(
    (anchor: string) => {
      const go = () => {
        document.getElementById(anchor)?.scrollIntoView({ block: 'start' })
        document.getElementById(`${anchor}-h`)?.focus({ preventScroll: true })
      }
      if (tab === 'doc') return go()
      setTab('doc')
      requestAnimationFrame(() => requestAnimationFrame(go))
    },
    [tab, setTab],
  )

  const refreshRules = useCallback(() => qc.invalidateQueries({ queryKey: ['rules', rulesId] }), [qc, rulesId])

  if (detail && detail.workspace_id !== workspaceId) return <Navigate replace to={`/w/${detail.workspace_id}/rules/${detail.id}`} />

  const hasDoc = detail != null && detail.yaml != null && (detail.status === 'draft' || detail.status === 'approved')
  const showNav = hasDoc && detail.rules != null

  return (
    <>
      <RulesCrumbs workspaceId={workspaceId} name={workspace?.name} version={detail?.version} />
      <div
        className={cn(
          'grid items-start gap-6 @min-[60rem]:grid-cols-[minmax(0,1fr)_18rem]',
          showNav && '@min-[75rem]:grid-cols-[13.5rem_minmax(0,1fr)_20rem]',
          !showNav && '@min-[75rem]:grid-cols-[minmax(0,1fr)_20rem]',
        )}
      >
        {showNav && (
          <aside className="sticky top-[4.5rem] hidden max-h-[calc(100dvh-6rem)] overflow-y-auto @min-[75rem]:block">
            <RulesNav rules={detail.rules!} assetTypes={workspace?.assets.equipment_types} observing={tab === 'doc'} onJump={jump} />
          </aside>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="panel min-w-0 gap-0 @container">
          {rules.isPending && (
            <div className="p-8">
              <LoadingRows rows={8} />
            </div>
          )}
          {rules.isError && (
            <div className="p-8">
              <Notice kind="danger">{rules.error.message}</Notice>
            </div>
          )}
          {detail && (
            <>
              <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border px-4 pt-5 pb-4 @min-[40rem]:px-8 @min-[40rem]:pt-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h1 className="text-lg font-bold">Rules v{detail.version}</h1>
                    <StatusBadge status={detail.status} />
                  </div>
                  <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
                    {originLine(detail, versions)}. Created {formatDate(detail.created_at)}.
                  </p>
                </div>
                {hasDoc && (
                  <TabsList aria-label="View" className="h-9 rounded-md border border-input bg-muted p-0.5">
                    <TabsTrigger value="doc" className={TRIGGER}>
                      Document
                    </TabsTrigger>
                    <TabsTrigger value="yaml" className={TRIGGER}>
                      YAML
                      {dirty && (
                        <>
                          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                          <span className="sr-only">, unsaved changes</span>
                        </>
                      )}
                    </TabsTrigger>
                  </TabsList>
                )}
              </header>

              {detail.status === 'extracting' && (
                <div className="px-4 py-6 @min-[40rem]:px-8">
                  <ExtractionLive jobId={detail.id} startedAt={detail.created_at} onFinished={refreshRules} />
                </div>
              )}
              {detail.status === 'failed' && (
                <Swap animate={animate}>
                  <div className="grid gap-5 px-4 py-6 @min-[40rem]:px-8">
                    <Notice kind="danger">
                      Extraction failed, so v{detail.version} has no rules. The events below show where it stopped. Extract again from the workspace.
                    </Notice>
                    <ExtractionLive jobId={detail.id} startedAt={detail.created_at} onFinished={refreshRules} />
                  </div>
                </Swap>
              )}
              {hasDoc && (
                <>
                  <TabsContent value="doc" className="px-4 pb-16 text-base @min-[40rem]:px-8">
                    <Swap animate={animate}>
                      <SourceLegend inferred={detail.rules ? allBullets(detail.rules).filter(isInferred).length : 0} />
                      {dirty && (
                        <Note className="mt-4">
                          The YAML tab has unsaved changes. This document shows v{detail.version} as saved.
                        </Note>
                      )}
                      {detail.rules ? (
                        <RulesDocument detail={detail} rules={detail.rules} assetTypes={workspace?.assets.equipment_types} />
                      ) : (
                        <Notice kind="danger" className="mt-6 whitespace-pre-wrap">
                          {detail.parse_error ?? 'This version has no rules.'} Fix it in the YAML tab and save a new version.
                        </Notice>
                      )}
                    </Swap>
                  </TabsContent>
                  <TabsContent value="yaml" className="px-4 pt-6 pb-8 @min-[40rem]:px-8">
                    <Swap animate={animate}>
                      <YamlPanel
                        yaml={detail.yaml!}
                        draft={draft}
                        version={detail.version}
                        next={nextVersion(versions)}
                        saving={save.isPending}
                        error={save.error?.message ?? null}
                        onDraft={(value) => {
                          setDraft(value)
                          if (save.isError) save.reset()
                        }}
                        onSave={() => draft !== null && save.mutate(draft)}
                        onDiscard={() => {
                          setDraft(null)
                          save.reset()
                        }}
                      />
                    </Swap>
                  </TabsContent>
                </>
              )}
            </>
          )}
        </Tabs>

        <div className="grid content-start gap-7 @max-[60rem]:order-first @min-[60rem]:sticky @min-[60rem]:top-[4.5rem] @min-[60rem]:max-h-[calc(100dvh-6rem)] @min-[60rem]:overflow-y-auto">
          {detail && (
            <>
              <ApprovalCard
                detail={detail}
                workspaceId={workspaceId}
                onApprove={() => approve.mutate()}
                approving={approve.isPending}
                error={approve.error?.message ?? null}
                justApproved={justApproved}
                unsaved={dirty}
              />
              <CoverageCard detail={detail} />
            </>
          )}
          <VersionsCard versions={versions} currentId={rulesId} workspaceId={workspaceId} />
        </div>
      </div>
    </>
  )
}

const TRIGGER = cn(
  'h-full rounded-[4px] px-3 text-sm font-medium text-muted-foreground',
  'data-active:bg-card data-active:font-bold data-active:text-foreground data-active:shadow-[0_0_0_1px_var(--input)]',
  'dark:data-active:border-transparent dark:data-active:bg-card dark:data-active:text-foreground',
)
