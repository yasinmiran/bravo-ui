import { Link } from 'react-router-dom'

import { Crumbs } from '@/components/Shell'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="mx-auto grid w-full max-w-prose content-start gap-4 py-12">
      <Crumbs>
        <span className="text-sm text-muted-foreground">Not found</span>
      </Crumbs>
      <h1 className="text-lg font-bold leading-tight">That page does not exist</h1>
      <p className="text-sm text-muted-foreground">The link may be out of date, or the workspace or process it pointed to was deleted.</p>
      <Button asChild className="w-fit">
        <Link to="/">Go to the workspaces</Link>
      </Button>
    </div>
  )
}
