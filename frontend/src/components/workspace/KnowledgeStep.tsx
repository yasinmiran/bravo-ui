import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardPasteIcon, FileTextIcon, UploadIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { api, formatDate, type WorkspaceDetail } from '@/api'
import { LoadingRows, Notice } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { DropZone } from './DropZone'
import { count, sentence } from './format'
import { Markdown } from './Markdown'
import { outline } from './styles'

const ACCEPT = '.md,.markdown,.txt,text/markdown,text/plain'

export function KnowledgeStep({ ws }: { ws: WorkspaceDetail }) {
  const qc = useQueryClient()
  const doc = ws.document
  const [mode, setMode] = useState<'view' | 'drop' | 'paste'>('view')
  const [text, setText] = useState('')
  const [viewing, setViewing] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)

  const content = useQuery({ queryKey: ['document', ws.id], queryFn: () => api.document(ws.id), enabled: !!doc && viewing })

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadDocument(ws.id, file),
    onSuccess: (fresh, file) => {
      qc.setQueryData(['workspace', ws.id], fresh)
      qc.invalidateQueries({ queryKey: ['workspace', ws.id] })
      qc.invalidateQueries({ queryKey: ['document', ws.id] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      setMode('view')
      setText('')
      toast.success(`Saved ${file.name}.`)
    },
  })

  function send(file: File) {
    setRejected(null)
    upload.mutate(file)
  }

  const pastedName = doc?.filename ?? 'domain_knowledge.md'
  const error =
    rejected ??
    (upload.error
      ? `Could not save ${upload.variables?.name ?? 'the document'}. ${sentence(upload.error.message)} Choose a markdown or plain text file with text in it.`
      : null)

  const showDrop = !doc || mode === 'drop'
  const showPaste = mode === 'paste'

  return (
    <div className="grid min-w-0 max-w-4xl grid-cols-[minmax(0,1fr)] gap-3">
      {error && <Notice kind="danger">{error}</Notice>}

      {showPaste ? (
        <form
          className="panel grid gap-2 p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) send(new File([text], pastedName, { type: 'text/markdown' }))
          }}
        >
          <Label htmlFor="knowledge-paste" className="font-bold">
            Paste the domain knowledge
          </Label>
          <Textarea
            id="knowledge-paste"
            autoFocus
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="# Integrity and reliability notes"
            className="max-h-[60vh] min-h-48 bg-card"
          />
          <p className="text-sm text-muted-foreground">
            Saved as {pastedName}.{doc && ' It replaces the current document; approved rules keep working until you extract again.'}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Button type="submit" disabled={!text.trim() || upload.isPending}>
              {upload.isPending ? 'Saving' : 'Save document'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={outline}
              onClick={() => {
                setMode('view')
                setText('')
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : showDrop ? (
        <DropZone
          title={doc ? `Drop a document to replace ${doc.filename}` : 'Drop the domain knowledge document here'}
          description={
            doc
              ? 'Markdown or plain text, one file. Approved rules keep working until you extract again.'
              : 'Markdown or plain text, one file: the handover notes or procedure that says how findings are triaged. You can replace it later.'
          }
          accept={ACCEPT}
          kind="a markdown or plain text file"
          busy={upload.isPending}
          onFile={send}
          onReject={setRejected}
          actions={
            <>
              <Button variant="outline" className={cn(outline, 'max-sm:h-11 max-sm:flex-1')} onClick={() => setMode('paste')}>
                <ClipboardPasteIcon data-icon="inline-start" />
                Paste text instead
              </Button>
              {doc && (
                <Button variant="ghost" className="max-sm:h-11" onClick={() => setMode('view')}>
                  Cancel
                </Button>
              )}
            </>
          }
        />
      ) : null}

      {doc && mode === 'view' && (
        <article className="panel">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
            <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 basis-56">
              <span className="block truncate font-semibold">{doc.filename}</span>
              <span className="block text-xs text-muted-foreground">
                {count(doc.sections, 'section')}, {count(doc.lines, 'line')}, added {formatDate(doc.uploaded_at)}
              </span>
            </div>
            <div className="flex gap-2 max-sm:w-full">
              <Button variant="outline" className={cn(outline, 'max-sm:h-11 max-sm:flex-1')} onClick={() => setMode('drop')}>
                <UploadIcon data-icon="inline-start" />
                Replace
              </Button>
              <Button className="max-sm:h-11 max-sm:flex-1" onClick={() => setViewing(true)}>
                Open
              </Button>
            </div>
          </div>
        </article>
      )}

      {doc && (
        <Sheet open={viewing} onOpenChange={setViewing}>
          <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
            <SheetHeader className="border-b border-border px-5 py-4 pr-12 sm:px-6">
              <SheetTitle className="text-md font-bold break-all">{doc.filename}</SheetTitle>
              <SheetDescription>
                {count(doc.lines, 'line')} in {count(doc.sections, 'section')}, added {formatDate(doc.uploaded_at)}. Reading view; the file is stored as written.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
              {content.isPending && <LoadingRows rows={8} />}
              {content.isError && <Notice kind="danger">The document did not load. {sentence(content.error.message)}</Notice>}
              {content.data && <Markdown source={content.data.content} />}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
