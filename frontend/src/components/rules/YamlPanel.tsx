import { lazy, Suspense, type KeyboardEvent } from 'react'

import { LoadingRows, Notice } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const YamlEditor = lazy(() => import('@/components/YamlEditor'))

// CodeMirror injects its theme unlayered, so these need `!` to beat it from Tailwind's utilities layer.
// Token colours go to ink: the default palette is unreadable on the dark surface, and colour is spent elsewhere.
const EDITOR_TOKENS = cn(
  '[&_.cm-line_span]:text-inherit!',
  '[&_.cm-editor]:bg-card! [&_.cm-editor]:text-foreground! [&_.cm-editor.cm-focused]:outline-2! [&_.cm-editor.cm-focused]:outline-ring! [&_.cm-editor.cm-focused]:-outline-offset-2!',
  '[&_.cm-scroller]:font-mono! [&_.cm-scroller]:text-sm! [&_.cm-scroller]:leading-[1.375rem]!',
  '[&_.cm-gutters]:border-border! [&_.cm-gutters]:bg-muted! [&_.cm-gutters]:text-muted-foreground!',
  '[&_.cm-activeLine]:bg-accent/60! [&_.cm-activeLineGutter]:bg-accent! [&_.cm-activeLineGutter]:text-foreground!',
  '[&_.cm-cursor]:border-l-foreground! [&_.cm-selectionBackground]:bg-accent!',
)

export function YamlPanel({
  yaml,
  draft,
  version,
  next,
  saving,
  error,
  onDraft,
  onSave,
  onDiscard,
}: {
  yaml: string
  draft: string | null
  version: number
  next: number
  saving: boolean
  error: string | null
  onDraft: (value: string) => void
  onSave: () => void
  onDiscard: () => void
}) {
  const dirty = draft !== null && draft !== yaml
  const saveShortcut = (e: KeyboardEvent) => {
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (dirty && !saving) onSave()
    }
  }
  return (
    <div className="overflow-hidden rounded-xl border border-input" onKeyDown={saveShortcut}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-muted px-4 py-2">
          <span className="text-sm font-bold">rules.yml</span>
          <span role="status" className={cn('inline-flex items-center gap-1.5 text-sm', dirty ? 'text-foreground' : 'text-muted-foreground')}>
            {dirty && <span aria-hidden className="size-1.5 rounded-full bg-primary" />}
            {dirty ? (
              <span>
                <b className="font-medium">Unsaved changes.</b> Saving creates v{next}; v{version} stays as it is.
              </span>
            ) : (
              `Saved as v${version}`
            )}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" disabled={!dirty || saving} onClick={onDiscard}>
              Discard
            </Button>
            <Button disabled={!dirty || saving} onClick={onSave}>
              Save as new version
            </Button>
          </div>
        </div>
        {error && (
          <Notice kind="danger" className="m-3 font-mono text-xs whitespace-pre-wrap">
            {error}
          </Notice>
        )}
      <div className={EDITOR_TOKENS}>
        <Suspense fallback={<LoadingRows rows={8} className="p-4" />}>
          <YamlEditor value={draft ?? yaml} onChange={onDraft} />
        </Suspense>
      </div>
    </div>
  )
}
