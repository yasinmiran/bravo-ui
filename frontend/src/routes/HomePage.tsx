import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { api } from '@/api'
import { LoadingRows, Notice } from '@/components/marks'
import { Crumbs } from '@/components/Shell'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSidebar } from '@/components/ui/sidebar'

/** The index route: the newest workspace when there is one, otherwise the first-run card. */
export function HomePage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { isMobile, setOpen, setOpenMobile } = useSidebar()
  const list = useQuery({ queryKey: ['workspaces'], queryFn: api.workspaces })
  const bravo = useMutation({
    mutationFn: api.createBravo,
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      navigate(`/w/${ws.id}`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function focusNewWorkspace() {
    if (isMobile) setOpenMobile(true)
    else setOpen(true)
    requestAnimationFrame(() => document.getElementById('ws-name')?.focus())
  }

  const crumb = (
    <Crumbs>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Workspaces</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </Crumbs>
  )

  if (list.isPending)
    return (
      <>
        {crumb}
        <LoadingRows rows={3} className="max-w-xl" />
      </>
    )
  if (list.isError)
    return (
      <>
        {crumb}
        <Notice kind="danger" className="max-w-xl">
          {list.error.message}
        </Notice>
      </>
    )
  if (list.data.length > 0) return <Navigate to={`/w/${list.data[0].id}`} replace />

  return (
    <>
      {crumb}
      <div className="mx-auto w-full max-w-md py-12">
        <Card>
          <CardHeader>
            <CardTitle>
              <h1>No workspaces yet</h1>
            </CardTitle>
            <CardDescription>
              One workspace per company or platform. You add its knowledge document, its assets and its rules, then submit findings as a process
              that drafts one ticket per finding.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => bravo.mutate()} disabled={bravo.isPending}>
              {bravo.isPending ? 'Loading' : 'Load Bravo example'}
            </Button>
            <Button variant="outline" onClick={focusNewWorkspace}>
              Create a workspace
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
