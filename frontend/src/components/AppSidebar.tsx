import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardListIcon, LogOutIcon, Trash2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useMatch, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { api, logout, type WorkspaceSummary } from '@/api'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'

/** The one line under a workspace name: what it is waiting for. */
function nextStep(ws: WorkspaceSummary): string {
  if (!ws.has_document) return 'Add the domain knowledge'
  if (!ws.assets) return 'Add the assets'
  if (!ws.approved_rules) return 'Extract and approve rules'
  if (!ws.processes) return 'Submit findings'
  if (ws.running_processes) return 'Drafting tickets'
  if (!ws.pending_tickets) return 'All tickets decided'
  return `${ws.pending_tickets} ticket${ws.pending_tickets === 1 ? '' : 's'} to decide`
}

export function AppSidebar() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()
  const list = useQuery({ queryKey: ['workspaces'], queryFn: api.workspaces })

  const workspaceMatch = useMatch('/w/:workspaceId/*')
  const processMatch = useMatch('/p/:processId')
  const processId = processMatch?.params.processId
  const process = useQuery({ queryKey: ['process', processId], queryFn: () => api.process(processId!), enabled: !!processId })
  const activeId = workspaceMatch?.params.workspaceId ?? process.data?.workspace_id

  const [name, setName] = useState('')

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }
  const open = (id: string) => {
    qc.invalidateQueries({ queryKey: ['workspaces'] })
    navigate(`/w/${id}`)
    closeOnMobile()
  }

  const create = useMutation({
    mutationFn: (n: string) => api.createWorkspace(n),
    onSuccess: (ws) => {
      setName('')
      open(ws.id)
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const bravo = useMutation({
    mutationFn: api.createBravo,
    onSuccess: (ws) => open(ws.id),
    onError: (e: Error) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteWorkspace(id),
    onSuccess: (_void, id) => {
      // Drop it from the cache first: the index route picks the next workspace from this list.
      qc.setQueryData<WorkspaceSummary[]>(['workspaces'], (old) => old?.filter((w) => w.id !== id))
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      if (id === activeId) navigate('/')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (n) create.mutate(n)
  }

  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/" onClick={closeOnMobile}>
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-foreground text-background">
                  <ClipboardListIcon className="size-4" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Triage</span>
                  <span className="truncate text-xs text-muted-foreground">Findings to tickets</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu aria-busy={list.isPending || undefined}>
              {list.isPending &&
                [0, 1, 2].map((i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton />
                  </SidebarMenuItem>
                ))}
              {list.isError && (
                <li role="alert" className="px-2 py-1.5 text-xs text-destructive">
                  {list.error.message}
                </li>
              )}
              {list.data?.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">No workspaces yet. Create one below.</li>}
              {list.data?.map((ws) => (
                <SidebarMenuItem key={ws.id}>
                  <SidebarMenuButton asChild size="lg" isActive={ws.id === activeId}>
                    <Link to={`/w/${ws.id}`} onClick={closeOnMobile}>
                      <span className="grid min-w-0 flex-1 leading-tight">
                        <span className="truncate font-medium">{ws.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{nextStep(ws)}</span>
                      </span>
                    </Link>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    showOnHover
                    aria-label={`Delete ${ws.name}`}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm(`Delete ${ws.name} and everything in it?`)) remove.mutate(ws.id)
                    }}
                  >
                    <Trash2Icon />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>New workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <form onSubmit={submit} className="grid gap-2 rounded-lg border bg-background p-3">
              <Label htmlFor="ws-name" className="sr-only">
                Workspace name
              </Label>
              <SidebarInput
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Company or platform"
                maxLength={120}
                autoComplete="off"
              />
              <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
                {create.isPending ? 'Creating' : 'Create workspace'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => bravo.mutate()} disabled={bravo.isPending}>
                {bravo.isPending ? 'Loading' : 'Load Bravo example'}
              </Button>
            </form>
            <p className="px-1 pt-2 text-xs text-muted-foreground">One workspace per company. You add its knowledge, assets and rules next.</p>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2">
          <ThemeSwitch />
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOutIcon data-icon="inline-start" />
            Sign out
          </Button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
