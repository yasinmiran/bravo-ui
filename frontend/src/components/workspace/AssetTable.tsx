import { Trash2Icon } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { toast } from 'sonner'

import type { Asset, AssetPatch } from '@/api'
import { Sce, Tag } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { Vstr } from './parts'
import { tbody, td, th } from './styles'

type Field = keyof AssetPatch
type TextField = 'equipment_type' | 'service_description' | 'redundancy' | 'engineer_comment'
type ScoreField = 'criticality_score' | 'reliability_score'

const LABEL: Record<Field, string> = {
  equipment_type: 'Type',
  safety_critical_element: 'Safety critical element',
  service_description: 'Service',
  criticality_score: 'Criticality',
  reliability_score: 'Reliability',
  redundancy: 'Redundancy',
  engineer_comment: 'Engineer comment',
}

const MAX_LENGTH: Record<TextField, number> = { equipment_type: 80, service_description: 400, redundancy: 120, engineer_comment: 4000 }

interface AssetTableProps {
  assets: Asset[]
  /** `${equipment_id}:${field}` for a saved cell, `${equipment_id}:*` for a new row. */
  flash: string | null
  typeListId: string
  redundancyListId: string
  onSave: (asset: Asset, patch: AssetPatch) => void
  onDelete: (asset: Asset) => void
}

export function AssetTable({ assets, flash, typeListId, redundancyListId, onSave, onDelete }: AssetTableProps) {
  const [editing, setEditing] = useState<{ id: string; field: Field } | null>(null)
  const stop = () => setEditing(null)

  /** One editable value: a quiet button at rest, the field's editor while editing. */
  function field(asset: Asset, name: Field, display: ReactNode, className?: string) {
    const isEditing = editing?.id === asset.equipment_id && editing.field === name
    const flashing = flash === `${asset.equipment_id}:${name}` || flash === `${asset.equipment_id}:*`
    const commit = (value: string | number | boolean) => {
      stop()
      if (value !== asset[name]) onSave(asset, { [name]: value })
    }
    if (isEditing)
      return (
        <div className="min-w-0">
          <Editor
            asset={asset}
            field={name}
            listId={name === 'equipment_type' ? typeListId : name === 'redundancy' ? redundancyListId : undefined}
            onCommit={commit}
            onCancel={stop}
          />
        </div>
      )
    return (
      <button
        type="button"
        onClick={() => setEditing({ id: asset.equipment_id, field: name })}
        className={cn(
          '-mx-1.5 block w-[calc(100%+0.75rem)] min-w-0 cursor-text rounded-sm px-1.5 py-0.5 [text-align:inherit] transition-colors hover:bg-muted',
          flashing ? 'bg-accent duration-0' : 'duration-200',
          className,
        )}
      >
        <span className="sr-only">
          Edit {LABEL[name].toLowerCase()} of {asset.equipment_id}:{' '}
        </span>
        {display}
      </button>
    )
  }

  return (
    <div className="panel relative overflow-x-auto">
      <table className="w-full min-w-[56rem] table-fixed border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Assets. Select a value to edit it.</caption>
        <colgroup>
          <col className="w-[11rem]" />
          <col className="w-[12.5rem]" />
          <col className="w-[3.5rem]" />
          <col className="w-[4.5rem]" />
          <col className="w-[4.5rem]" />
          <col />
          <col className="w-[2.75rem]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={cn(th, 'sticky left-0 z-20 max-lg:shadow-[inset_-1px_0_0_var(--border)]')}>
              Equipment
              <span className="block font-normal text-muted-foreground">Service</span>
            </th>
            <th scope="col" className={th}>
              Type
              <span className="block font-normal text-muted-foreground">Redundancy</span>
            </th>
            <th scope="col" className={th}>
              <abbr title="Safety Critical Element" className="no-underline">
                SCE
              </abbr>
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              <ScaleHint label="Crit." title="Criticality" hint="1 to 10, where 10 is most critical. The starting point for impact." />
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              <ScaleHint label="Rel." title="Reliability" hint="1 to 10, where 10 is highly reliable. It runs opposite to likelihood: a reliable item starts low." />
            </th>
            <th scope="col" className={th}>
              Engineer comment
            </th>
            <th scope="col" className={th}>
              <span className="sr-only">Delete</span>
            </th>
          </tr>
        </thead>
        <tbody className={tbody}>
          {assets.map((a) => (
            <tr key={a.equipment_id} id={`asset-${a.equipment_id}`} className="group/row">
              <th
                scope="row"
                className={cn(
                  td,
                  'sticky left-0 z-10 bg-card text-left font-normal max-lg:shadow-[inset_-1px_0_0_var(--border)]',
                  flash === `${a.equipment_id}:*` && 'bg-accent',
                )}
              >
                <Tag className="block text-base leading-5 break-all">{a.equipment_id}</Tag>
                {field(
                  a,
                  'service_description',
                  <span className="block truncate text-xs text-muted-foreground" title={a.service_description}>
                    {a.service_description || 'No service description'}
                  </span>,
                )}
              </th>
              <td className={td}>
                {field(
                  a,
                  'equipment_type',
                  <span className="block leading-5 break-words">{a.equipment_type}</span>,
                )}
                {field(a, 'redundancy', <Vstr className="inline-block max-w-full truncate align-bottom">{a.redundancy}</Vstr>)}
              </td>
              <td className={td}>{field(a, 'safety_critical_element', a.safety_critical_element ? <Sce /> : <span className="text-muted-foreground">No</span>)}</td>
              <td className={cn(td, 'text-right')}>{field(a, 'criticality_score', a.criticality_score, 'text-base font-bold tabular-nums')}</td>
              <td className={cn(td, 'text-right')}>{field(a, 'reliability_score', a.reliability_score, 'text-base font-bold tabular-nums')}</td>
              <td className={td}>
                {field(
                  a,
                  'engineer_comment',
                  <span className="block truncate text-muted-foreground" title={a.engineer_comment}>
                    {a.engineer_comment || 'No comment'}
                  </span>,
                )}
              </td>
              <td className={cn(td, 'pl-0')}>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Delete ${a.equipment_id}`} onClick={() => onDelete(a)}>
                  <Trash2Icon />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A score column header: short label, the scale and its direction one hover away. */
function ScaleHint({ label, title, hint }: { label: string; title: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="cursor-help underline decoration-dotted underline-offset-2">
          <abbr title={title} className="no-underline">
            {label}
          </abbr>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-60 text-left">
        {title}: {hint}
      </TooltipContent>
    </Tooltip>
  )
}

interface EditorProps {
  asset: Asset
  field: Field
  listId?: string
  onCommit: (value: string | number | boolean) => void
  onCancel: () => void
}

function Editor({ asset, field, listId, onCommit, onCancel }: EditorProps) {
  const label = `${LABEL[field]} of ${asset.equipment_id}`
  if (field === 'safety_critical_element') return <BoolEditor initial={asset[field]} label={label} onCommit={onCommit} onCancel={onCancel} />
  if (field === 'criticality_score' || field === 'reliability_score')
    return <ScoreEditor initial={asset[field]} field={field} label={label} onCommit={onCommit} onCancel={onCancel} />
  return <TextEditor initial={asset[field]} field={field} label={label} listId={listId} onCommit={onCommit} onCancel={onCancel} />
}

interface TextEditorProps {
  initial: string
  field: TextField
  label: string
  listId?: string
  onCommit: (value: string) => void
  onCancel: () => void
}

function TextEditor({ initial, field, label, listId, onCommit, onCancel }: TextEditorProps) {
  const [value, setValue] = useState(initial)
  const settled = useRef(false)
  const multiline = field === 'engineer_comment'

  function commit() {
    if (settled.current) return
    settled.current = true
    const v = value.trim()
    if (field === 'equipment_type' && !v) {
      toast.error(`The type cannot be empty. Kept ${initial}.`)
      onCancel()
      return
    }
    onCommit(field === 'redundancy' && !v ? 'None' : v)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      settled.current = true
      onCancel()
    } else if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
      e.preventDefault()
      commit()
    }
  }

  if (multiline)
    return (
      <div className="grid gap-1.5">
        <Textarea
          autoFocus
          value={value}
          maxLength={MAX_LENGTH[field]}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          aria-label={label}
          rows={3}
          className="min-h-28 bg-card text-sm"
        />
        <span className="text-xs text-muted-foreground">Enter saves, Shift Enter starts a new line, Esc cancels.</span>
      </div>
    )
  return (
    <Input
      autoFocus
      value={value}
      maxLength={MAX_LENGTH[field]}
      list={listId}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      onFocus={(e) => e.currentTarget.select()}
      aria-label={label}
      className={cn('h-8 bg-card text-sm', field === 'redundancy' && 'font-mono text-xs')}
    />
  )
}

interface ScoreEditorProps {
  initial: number
  field: ScoreField
  label: string
  onCommit: (value: number) => void
  onCancel: () => void
}

function ScoreEditor({ initial, field, label, onCommit, onCancel }: ScoreEditorProps) {
  const [value, setValue] = useState(String(initial))
  const settled = useRef(false)
  const parsed = /^\d+$/.test(value.trim()) ? Number(value) : NaN
  const valid = parsed >= 1 && parsed <= 10

  function commit(leaving: boolean) {
    if (settled.current) return
    if (!valid) {
      toast.error(`${LABEL[field]} must be a whole number from 1 to 10.${leaving ? ` Kept ${initial}.` : ''}`)
      if (leaving) {
        settled.current = true
        onCancel()
      }
      return
    }
    settled.current = true
    onCommit(parsed)
  }

  return (
    <Input
      autoFocus
      type="number"
      inputMode="numeric"
      min={1}
      max={10}
      step={1}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => commit(true)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          settled.current = true
          onCancel()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          commit(false)
        }
      }}
      onFocus={(e) => e.currentTarget.select()}
      aria-label={`${label}, 1 to 10${field === 'reliability_score' ? ', 10 is reliable' : ''}`}
      aria-invalid={!valid}
      className="ml-auto h-8 w-16 bg-card text-right text-sm font-bold"
    />
  )
}

interface BoolEditorProps {
  initial: boolean
  label: string
  onCommit: (value: boolean) => void
  onCancel: () => void
}

/** Toggling saves at once. A click outside, Tab or Esc leaves it unchanged. */
function BoolEditor({ initial, label, onCommit, onCancel }: BoolEditorProps) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (box.current && !box.current.contains(e.target as Node)) onCancel()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onCancel])

  return (
    <div
      ref={box}
      className="flex items-center gap-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        } else if (e.key === 'Tab') onCancel()
      }}
    >
      <Switch autoFocus defaultChecked={initial} onCheckedChange={onCommit} aria-label={label} />
      <span className="text-xs text-muted-foreground">{initial ? 'Yes' : 'No'}</span>
    </div>
  )
}
