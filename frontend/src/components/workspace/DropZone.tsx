import { UploadIcon } from 'lucide-react'
import { useRef, useState, type DragEvent, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { accepts } from './format'

interface DropZoneProps {
  title: string
  description: ReactNode
  accept: string
  /** Names the expected kind of file in the error a wrong drop gets, such as "a CSV file". */
  kind: string
  chooseLabel?: string
  busy?: boolean
  onFile: (file: File) => void
  onReject: (message: string) => void
  /** Buttons after Choose file, such as Paste text instead. */
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

export function DropZone({ title, description, accept, kind, chooseLabel = 'Choose file', busy, onFile, onReject, actions, children, className }: DropZoneProps) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  function take(file: File | undefined) {
    if (!file) return
    if (!accepts(file, accept)) {
      onReject(`${file.name} is not ${kind}. Choose ${kind} instead.`)
      return
    }
    onFile(file)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    if (!busy) take(e.dataTransfer.files[0])
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!busy) setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={onDrop}
      className={cn(
        'grid justify-items-start gap-3 rounded-xl border-[1.5px] border-dashed border-input bg-card px-5 py-8 transition-colors duration-100 sm:px-7 sm:py-10',
        over && 'border-primary bg-accent',
        className,
      )}
    >
      <h3 className="flex items-center gap-2 text-md font-bold">
        <UploadIcon className="size-5 shrink-0 text-muted-foreground" />
        {title}
      </h3>
      <div className="max-w-[68ch] text-muted-foreground">{description}</div>
      <div className="mt-1 flex w-full flex-wrap items-center gap-2">
        <Button onClick={() => input.current?.click()} disabled={busy} className="max-sm:h-11 max-sm:flex-1">
          {busy ? 'Reading' : chooseLabel}
        </Button>
        {actions}
      </div>
      {children}
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          take(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
