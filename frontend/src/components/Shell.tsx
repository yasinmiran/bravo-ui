import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { getPassphrase, LOGOUT_EVENT } from '@/api'
import { AppSidebar } from '@/components/AppSidebar'
import { PageWidthProvider, usePageObserver } from '@/components/PageWidth'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'

export function RequireAuth() {
  const location = useLocation()
  if (!getPassphrase()) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}

const CrumbSlot = createContext<HTMLElement | null>(null)

/** Renders its children in the top bar, after the sidebar trigger. */
export function Crumbs({ children }: { children: ReactNode }) {
  const slot = useContext(CrumbSlot)
  return slot ? createPortal(children, slot) : null
}

const SIDEBAR_STYLE = { '--sidebar-width': '20rem' } as CSSProperties

export function Shell() {
  const navigate = useNavigate()
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [pageWidth, pageRef] = usePageObserver()
  const qc = useQueryClient()
  useEffect(() => {
    const onLogout = () => {
      qc.clear()
      navigate('/login', { replace: true })
    }
    window.addEventListener(LOGOUT_EVENT, onLogout)
    return () => window.removeEventListener(LOGOUT_EVENT, onLogout)
  }, [navigate, qc])

  return (
    <SidebarProvider style={SIDEBAR_STYLE}>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:rounded-t-xl">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-center" />
          <div ref={setSlot} id="shell-crumbs" className="flex min-w-0 flex-1 items-center" />
        </header>
        <div ref={pageRef} className="@container flex min-w-0 flex-1 flex-col p-4 md:p-6">
          <PageWidthProvider value={pageWidth}>
            <CrumbSlot.Provider value={slot}>
              <Outlet />
            </CrumbSlot.Provider>
          </PageWidthProvider>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
