import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

import { RequireAuth, Shell } from './components/Shell'
import { Toaster } from './components/ui/sonner'
import { TooltipProvider } from './components/ui/tooltip'
import './index.css'
import { ApiError } from './api'
import { HomePage } from './routes/HomePage'
import { NotFoundPage } from './routes/NotFoundPage'
import { LoginPage } from './routes/LoginPage'
import { WorkspacePage } from './routes/WorkspacePage'

const ProcessPage = lazy(() => import('./routes/ProcessPage').then((m) => ({ default: m.ProcessPage })))
const RulesPage = lazy(() => import('./routes/RulesPage').then((m) => ({ default: m.RulesPage })))

const fallback = <p className="py-8 text-sm text-muted-foreground" aria-busy="true">Loading</p>

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 401 or 404 will not get better on a second try; only server errors earn one.
      retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status < 500),
      refetchOnWindowFocus: false,
    },
  },
})

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <Shell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'w/:workspaceId', element: <WorkspacePage /> },
          { path: 'w/:workspaceId/rules', element: <Suspense fallback={fallback}><RulesPage /></Suspense> },
          { path: 'w/:workspaceId/rules/:rulesId', element: <Suspense fallback={fallback}><RulesPage /></Suspense> },
          { path: 'p/:processId', element: <Suspense fallback={fallback}><ProcessPage /></Suspense> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}>
        <TooltipProvider delayDuration={300}>
          <RouterProvider router={router} />
        </TooltipProvider>
      </MotionConfig>
      <Toaster position="top-center" />
    </QueryClientProvider>
  </StrictMode>,
)
