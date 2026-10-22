import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'

import type { AssetInput } from '@/api'
import { Note, Notice } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { outline } from './styles'

interface Draft {
  equipment_id: string
  equipment_type: string
  service_description: string
  criticality_score: number | null
  reliability_score: number | null
  safety_critical_element: boolean
  redundancy: string
  engineer_comment: string
}

type Errors = Partial<Record<keyof Draft, string>>

const EMPTY: Draft = {
  equipment_id: '',
  equipment_type: '',
  service_description: '',
  criticality_score: null,
  reliability_score: null,
  safety_critical_element: false,
  redundancy: 'None',
  engineer_comment: '',
}

const SCORES = Array.from({ length: 10 }, (_, i) => i + 1)

function check(d: Draft, existingIds: Set<string>): Errors {
  const errors: Errors = {}
  const id = d.equipment_id.trim()
  if (!id) errors.equipment_id = 'Give the equipment id, such as FW-8103.'
  else if (existingIds.has(id)) errors.equipment_id = `${id} is already in the assets. Edit that row instead, or use another id.`
  if (!d.equipment_type.trim()) errors.equipment_type = 'Give the equipment type, such as Firewater Pump.'
  if (d.criticality_score === null) errors.criticality_score = 'Pick a criticality from 1 to 10.'
  if (d.reliability_score === null) errors.reliability_score = 'Pick a reliability from 1 to 10.'
  return errors
}

interface AssetFormProps {
  existingIds: Set<string>
  types: string[]
  redundancies: string[]
  /** The approved rules version, so a new type or redundancy string can say it makes that version out of date. */
  approvedVersion: number | null
  typeListId: string
  redundancyListId: string
  pending: boolean
  error: string | null
  onSubmit: (asset: AssetInput) => void
  onCancel: () => void
}

/** The body of the Add asset dialog. Mounted with the dialog, so it starts empty every time. */
export function AssetForm({ existingIds, types, redundancies, approvedVersion, typeListId, redundancyListId, pending, error, onSubmit, onCancel }: AssetFormProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const type = draft.equipment_type.trim()
  const redundancy = draft.redundancy.trim() || 'None'
  const newType = approvedVersion !== null && type !== '' && !types.includes(type)
  const newRedundancy = approvedVersion !== null && !redundancies.includes(redundancy)

  function submit(e: FormEvent) {
    e.preventDefault()
    const found = check(draft, existingIds)
    setErrors(found)
    if (Object.keys(found).length) return
    onSubmit({
      equipment_id: draft.equipment_id.trim(),
      equipment_type: type,
      service_description: draft.service_description.trim(),
      criticality_score: draft.criticality_score!,
      reliability_score: draft.reliability_score!,
      safety_critical_element: draft.safety_critical_element,
      redundancy,
      engineer_comment: draft.engineer_comment.trim(),
    })
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      <DialogHeader>
        <DialogTitle className="text-lg font-bold">Add asset</DialogTitle>
        <DialogDescription>It joins the registry at once, and findings are checked against it from then on.</DialogDescription>
      </DialogHeader>

      <Section title="Equipment">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Equipment id" htmlFor="asset-id" error={errors.equipment_id}>
            <Input
              id="asset-id"
              autoFocus
              maxLength={40}
              value={draft.equipment_id}
              onChange={(e) => set('equipment_id', e.target.value)}
              aria-invalid={!!errors.equipment_id}
              aria-describedby={errors.equipment_id ? 'asset-id-error' : undefined}
              placeholder="FW-8103"
              className="h-10 text-base font-semibold"
            />
          </Field>
          <Field
            label="Equipment type"
            htmlFor="asset-type"
            error={errors.equipment_type}
            hint={newType ? undefined : approvedVersion !== null ? `An existing type keeps rules v${approvedVersion} valid.` : undefined}
            note={newType ? `New type. Approved rules v${approvedVersion} have no section for it, so they go out of date until you extract again.` : undefined}
          >
            <Input
              id="asset-type"
              list={typeListId}
              maxLength={80}
              value={draft.equipment_type}
              onChange={(e) => set('equipment_type', e.target.value)}
              aria-invalid={!!errors.equipment_type}
              aria-describedby={errors.equipment_type ? 'asset-type-error' : undefined}
              placeholder="Firewater Pump"
              className="h-10 text-base"
            />
          </Field>
        </div>
        <Field label="Service" htmlFor="asset-service" hint="What it does, in the words of the registry.">
          <Input
            id="asset-service"
            maxLength={400}
            value={draft.service_description}
            onChange={(e) => set('service_description', e.target.value)}
            placeholder="Diesel driven firewater pump C"
            className="h-10 text-base"
          />
        </Field>
      </Section>

      <Section title="Registry scores" description="The two numbers each finding starts from. The finding text moves them later.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Criticality" htmlFor="asset-crit" hint="10 is most critical. The starting point for impact." error={errors.criticality_score}>
            <ScorePicker id="asset-crit" value={draft.criticality_score} invalid={!!errors.criticality_score} onChange={(n) => set('criticality_score', n)} />
          </Field>
          <Field
            label="Reliability"
            htmlFor="asset-rel"
            hint="10 is highly reliable. It runs opposite to likelihood: a reliable item starts low."
            error={errors.reliability_score}
          >
            <ScorePicker id="asset-rel" value={draft.reliability_score} invalid={!!errors.reliability_score} onChange={(n) => set('reliability_score', n)} />
          </Field>
        </div>
      </Section>

      <Section title="Protection and redundancy">
        <label className="flex items-center justify-between gap-4 rounded-lg border border-input px-4 py-3">
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">Safety Critical Element</span>
            <span className="text-sm text-muted-foreground">Judged against the major accident it protects against, not repair cost.</span>
          </span>
          <Switch checked={draft.safety_critical_element} onCheckedChange={(v) => set('safety_critical_element', v)} aria-label="Safety Critical Element" />
        </label>
        <Field
          label="Redundancy"
          htmlFor="asset-red"
          hint={newRedundancy ? undefined : 'Written exactly as the rules will read it. Pick a known string or type a new one.'}
          note={newRedundancy ? `New redundancy string. Approved rules v${approvedVersion} do not classify it, so they go out of date until you extract again.` : undefined}
        >
          <Input
            id="asset-red"
            list={redundancyListId}
            maxLength={120}
            value={draft.redundancy}
            onChange={(e) => set('redundancy', e.target.value)}
            placeholder="None"
            className="h-10 font-mono text-sm"
          />
          {redundancies.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Known redundancy strings">
              {redundancies.map((r) => {
                const on = r === redundancy
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('redundancy', r)}
                    className={cn(
                      'rounded-md border border-input px-2 py-1 font-mono text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                      on && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
                    )}
                  >
                    {r}
                  </button>
                )
              })}
            </div>
          )}
        </Field>
      </Section>

      <Section title="Engineer comment">
        <Field label="Comment" htmlFor="asset-comment" hint="The rules quote it. Write what an engineer would want the next person to know." labelHidden>
          <Textarea
            id="asset-comment"
            rows={5}
            maxLength={4000}
            value={draft.engineer_comment}
            onChange={(e) => set('engineer_comment', e.target.value)}
            placeholder="Single train, no spare. Vibration is trended daily."
            className="max-h-64 min-h-28 text-base"
          />
        </Field>
      </Section>

      {error && <Notice kind="danger">{error}</Notice>}

      <DialogFooter className="sticky -bottom-6 -mx-6 -mb-6 border-t border-border bg-popover px-6 py-4">
        <Button type="button" variant="outline" className={cn(outline, 'h-10')} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="h-10 px-4" disabled={pending}>
          {pending ? 'Adding' : 'Add asset'}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Ten buttons in a row. Arrow keys move the choice; the chosen number is filled. */
function ScorePicker({ id, value, invalid, onChange }: { id: string; value: number | null; invalid?: boolean; onChange: (n: number) => void }) {
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = Math.min(10, Math.max(1, (value ?? (e.key === 'ArrowRight' ? 0 : 11)) + (e.key === 'ArrowRight' ? 1 : -1)))
    onChange(next)
    document.getElementById(`${id}-${next}`)?.focus()
  }
  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={`${id}-label`}
      aria-invalid={invalid || undefined}
      onKeyDown={onKey}
      className={cn('grid grid-cols-10 gap-1 rounded-lg', invalid && 'ring-3 ring-destructive/20')}
    >
      {SCORES.map((n) => {
        const on = value === n
        return (
          <button
            key={n}
            id={`${id}-${n}`}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (value === null && n === 1) ? 0 : -1}
            onClick={() => onChange(n)}
            className={cn(
              'h-10 rounded-md border border-input text-sm font-semibold tabular-nums transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
              invalid && 'border-destructive/50',
              on && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-border pt-5 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="grid gap-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

interface FieldProps {
  label: string
  htmlFor: string
  hint?: string
  /** A live remark about the value, such as a type the rules do not know yet. */
  note?: string
  error?: string
  labelHidden?: boolean
  children: ReactNode
}

function Field({ label, htmlFor, hint, note, error, labelHidden = false, children }: FieldProps) {
  return (
    <div className="grid content-start gap-2">
      <Label id={`${htmlFor}-label`} htmlFor={htmlFor} className={cn(labelHidden && 'sr-only')}>
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : note ? (
        <Note>{note}</Note>
      ) : (
        hint && <p className="text-sm text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
