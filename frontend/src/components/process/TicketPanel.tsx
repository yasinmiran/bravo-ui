import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, FlagIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { api, bandKey, bandLabel, type Assessment, type Decision, type ProcessDetail, type Rules, type Trace } from '@/api'
import { DecisionMark, LoadingRows, Notice, Sce, Tag } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { Kbd, Literal, SectionTitle } from './bits'
import { ATTEMPT_OUTCOME, bandOf, floorTicks, formatDay, noteKind, urgencySteps, type Bands } from './derive'
import { shortcutFree } from './keys'
import { Reasons } from './Ladder'
import { NumberLine, UrgencySteps } from './Urgency'

interface TicketPanelProps {
  ticketId: string
  processId: string
  bands: Bands
  rules: Rules | null
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  /** Called after approve or reject so the list can move on to the next pending ticket. */
  onDecided: (decision: Decision) => void
}

const editable = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function TicketPanel({ ticketId, processId, bands, rules, onClose, onPrev, onNext, onDecided }: TicketPanelProps) {
  const qc = useQueryClient()
  const ticket = useQuery({ queryKey: ['ticket', ticketId], queryFn: () => api.ticket(ticketId) })
  const [note, setNote] = useState('')
  const [needNote, setNeedNote] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const [flash, setFlash] = useState<Decision | null>(null)

  const decide = useMutation({
    mutationFn: ({ decision, text }: { decision: Decision; text: string }) => api.decide(ticketId, decision, text),
    onSuccess: (updated, { decision }) => {
      qc.setQueryData(['ticket', ticketId], updated)
      qc.setQueryData<ProcessDetail>(['process', processId], (old) =>
        old
          ? {
              ...old,
              tickets: old.tickets.map((t) =>
                t.id === updated.id ? { ...t, decision: updated.decision, decision_note: updated.decision_note, decided_at: updated.decided_at } : t,
              ),
            }
          : old,
      )
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      if (decision === 'pending') {
        toast('Reopened', { description: `${updated.ticket.ticket_id} is pending again.` })
        return
      }
      setFlash(decision)
      toast.success(decision === 'approved' ? `Approved ${updated.ticket.ticket_id}` : `Rejected ${updated.ticket.ticket_id}`)
      onDecided(decision)
    },
    onError: (e: Error) => toast.error(`Could not record the decision. ${e.message}`),
  })

  function approve() {
    if (!ticket.data || ticket.data.decision !== 'pending' || decide.isPending) return
    decide.mutate({ decision: 'approved', text: note })
  }
  function reject() {
    if (!ticket.data || ticket.data.decision !== 'pending' || decide.isPending) return
    if (!note.trim()) {
      setNeedNote(true)
      noteRef.current?.focus()
      return
    }
    decide.mutate({ decision: 'rejected', text: note })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editable(e.target)) (e.target as HTMLElement).blur()
        else onClose()
        return
      }
      if (!shortcutFree(e.target, rootRef.current) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'a' || e.key === 'A') approve()
      else if (e.key === 'r' || e.key === 'R') reject()
      else if ((e.key === 'j' || e.key === 'ArrowDown') && onNext) {
        e.preventDefault()
        onNext()
      } else if ((e.key === 'k' || e.key === 'ArrowUp') && onPrev) {
        e.preventDefault()
        onPrev()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (ticket.isPending) return <LoadingRows rows={8} className="p-5" />
  if (ticket.isError) return <Notice kind="danger" className="m-4">{ticket.error.message}</Notice>
  const d = ticket.data
  const t = d.ticket
  const tr = d.trace
  const failed = tr.assessment === null
  const band = tr.urgency?.band ?? bandOf(t.urgency.score, bands)
  const reasons = tr.review.reasons

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="tag text-lg">{t.ticket_id}</h2>
            {tr.equipment.safety_critical_element && <Sce />}
            <DecisionMark decision={d.decision} className="ml-1" />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            From {t.finding_id} on <Tag>{tr.equipment.equipment_id}</Tag>, {tr.equipment.equipment_type}. Reported {formatDay(tr.finding.reported_date)} by{' '}
            {tr.finding.reported_by}, {tr.finding.reporter_role}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onPrev && (
            <Button variant="ghost" size="icon-sm" aria-label="Previous ticket" onClick={onPrev}>
              <ChevronUpIcon />
            </Button>
          )}
          {onNext && (
            <Button variant="ghost" size="icon-sm" aria-label="Next ticket" onClick={onNext}>
              <ChevronDownIcon />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <XIcon />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <motion.div
          key={flash ?? 'none'}
          initial={flash && !reduce ? { backgroundColor: flash === 'approved' ? 'var(--ok-wash)' : 'var(--danger-wash)' } : false}
          animate={{ backgroundColor: 'rgba(0,0,0,0)' }}
          transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
        >
          <div className={cn('flex items-center gap-4 px-5 py-4', `band-${bandKey(band)}`)}>
            <span className="text-num font-extrabold tabular-nums leading-none">{t.urgency.score}</span>
            <div>
              <div className="text-md font-extrabold leading-tight">{failed ? 'Triage failed' : bandLabel(band)}</div>
              <div className="text-sm opacity-90">
                {failed
                  ? 'Scored 10 across so a human sees it first'
                  : t.review_required
                    ? `Needs review, ${reasons.length} reason${reasons.length === 1 ? '' : 's'}`
                    : 'Straight to the work queue'}
              </div>
            </div>
          </div>

          <div className="space-y-6 px-5 py-5">
            <p className="max-w-[68ch] text-md leading-6">{t.summary}</p>
            <div>
              <SectionTitle>Recommended action</SectionTitle>
              <p className="max-w-[68ch] text-base">{t.recommended_action}</p>
            </div>
            {reasons.length > 0 && (
              <div className="rounded-md bg-muted px-4 py-3 text-sm">
                <SectionTitle className="mb-2">
                  <FlagIcon className="size-3.5" /> Review before it enters the queue
                </SectionTitle>
                <Reasons reasons={reasons} />
              </div>
            )}

            {!failed && tr.assessment && (
              <div className="grid gap-6 @min-[26rem]:grid-cols-2">
                <ScoreBlock
                  label="Likelihood of failure"
                  score={tr.assessment.likelihood_of_failure.score}
                  prior={11 - tr.equipment.reliability_score}
                  priorText={`Registry start ${11 - tr.equipment.reliability_score}, from reliability ${tr.equipment.reliability_score} inverted.`}
                  rationale={tr.assessment.likelihood_of_failure.rationale}
                />
                <ScoreBlock
                  label="Impact of failure"
                  score={tr.assessment.impact_of_failure.score}
                  prior={tr.equipment.criticality_score}
                  priorText={`Registry start ${tr.equipment.criticality_score}, from criticality.`}
                  rationale={tr.assessment.impact_of_failure.rationale}
                />
              </div>
            )}

            {tr.urgency && tr.assessment && (
              <div>
                <SectionTitle>How urgency was derived</SectionTitle>
                <UrgencyBlock trace={tr} bands={bands} rules={rules} />
              </div>
            )}
            {failed && (
              <Notice kind="danger">
                Automatic triage failed: {tr.violations.join('; ')}. The ticket is scored 10 across and must be assessed by hand.
              </Notice>
            )}

            {tr.assessment && (
              <div>
                <SectionTitle>Model flags</SectionTitle>
                <Flags a={tr.assessment} />
              </div>
            )}

            <div>
              <SectionTitle>Batch notes</SectionTitle>
              {tr.notes.length ? (
                <ul className="grid max-w-[68ch] gap-2 text-sm">
                  {tr.notes.map((n, i) => (
                    <li key={i}>
                      <b className="block font-bold text-foreground">{noteKind(n.kind)}</b>
                      <span className="text-muted-foreground">{n.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None. Nothing about the batch changes how this finding reads.</p>
              )}
            </div>

            <div>
              <SectionTitle>Model attempts</SectionTitle>
              <Attempts trace={tr} />
            </div>

            <div>
              <SectionTitle>Finding</SectionTitle>
              <blockquote className="max-w-[68ch] border-l-2 border-input pl-3 text-sm text-foreground">{tr.finding.finding_description}</blockquote>
              <Facts
                items={[
                  ['Inspection', `${tr.finding.inspection_type}, ${tr.finding.inspection_method}`],
                  ['Reported', `${formatDay(tr.finding.reported_date)} by ${tr.finding.reported_by}, ${tr.finding.reporter_role}`],
                ]}
              />
            </div>
            <div>
              <SectionTitle>Equipment</SectionTitle>
              <Facts
                items={[
                  ['Id', <Tag key="id">{tr.equipment.equipment_id}</Tag>],
                  ['Type', tr.equipment.equipment_type],
                  ['Service', tr.equipment.service_description],
                  ['Criticality', `${tr.equipment.criticality_score} of 10`],
                  ['Reliability', `${tr.equipment.reliability_score} of 10, 10 is reliable`],
                  ['Safety critical', tr.equipment.safety_critical_element ? 'Yes' : 'No'],
                  ['Redundancy', <Literal key="r">{tr.equipment.redundancy}</Literal>],
                  ['Engineer comment', tr.equipment.engineer_comment || 'None'],
                ]}
              />
            </div>

            <details className="group text-sm">
              <summary className="cursor-pointer font-bold text-muted-foreground hover:text-foreground">Prompt as sent</summary>
              <div className="mt-2 grid gap-3">
                <div>
                  <p className="mb-1 text-xs font-bold text-muted-foreground">System</p>
                  <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground">{tr.prompt.system}</pre>
                </div>
                <div>
                  <p className="mb-1 text-xs font-bold text-muted-foreground">User</p>
                  <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground">{tr.prompt.user}</pre>
                </div>
              </div>
            </details>
          </div>
        </motion.div>
      </div>

      <div className="border-t border-border bg-card px-5 py-4">
        {d.decision === 'pending' ? (
          <>
            <Textarea
              ref={noteRef}
              value={note}
              onChange={(e) => {
                setNote(e.target.value)
                if (e.target.value.trim()) setNeedNote(false)
              }}
              placeholder="Note for the record. Required to reject."
              aria-label="Decision note"
              aria-describedby={needNote ? 'decision-note-help' : undefined}
              rows={2}
              aria-invalid={needNote}
              className={cn('min-h-14 bg-card', needNote && 'border-destructive')}
            />
            {needNote && (
              <p id="decision-note-help" role="alert" className="mt-1 text-sm text-destructive">
                Say why before rejecting.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="outline" className="border-input" onClick={reject} disabled={decide.isPending}>
                <XIcon data-icon="inline-start" />
                Reject
              </Button>
              <Button onClick={approve} disabled={decide.isPending}>
                <CheckIcon data-icon="inline-start" />
                Approve
              </Button>
              <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground @min-[60rem]:flex">
                <Kbd>A</Kbd> approve <Kbd>R</Kbd> reject <Kbd>J</Kbd>
                <Kbd>K</Kbd> move <Kbd>Esc</Kbd> close
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <DecisionMark decision={d.decision} />
              {d.decision_note && <p className="mt-1 text-muted-foreground">{d.decision_note}</p>}
            </div>
            <Button variant="outline" className="border-input" onClick={() => decide.mutate({ decision: 'pending', text: '' })} disabled={decide.isPending}>
              <RotateCcwIcon data-icon="inline-start" />
              Reopen
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function ScoreBlock({ label, score, prior, priorText, rationale }: { label: string; score: number; prior: number; priorText: string; rationale: string }) {
  const delta = score - prior
  const moved = delta === 0 ? 'Scored at the registry start.' : `Scored ${Math.abs(delta)} ${delta > 0 ? 'above' : 'below'} the registry start.`
  return (
    <div>
      <SectionTitle className="mb-1">{label}</SectionTitle>
      <p className="flex items-baseline gap-1">
        <span className="text-xl font-extrabold tabular-nums">{score}</span>
        <span className="text-sm text-muted-foreground">of 10</span>
      </p>
      <div className="relative mt-2 mb-4">
        <div className="grid grid-cols-10 gap-0.5" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={cn('h-2 rounded-[1px]', i < score ? 'bg-foreground' : 'bg-border')} />
          ))}
        </div>
        <span
          aria-hidden
          title={`Registry start ${prior}`}
          className="absolute top-full h-0 w-0 -translate-x-1/2 border-x-[5px] border-b-[6px] border-x-transparent border-b-foreground"
          style={{ left: `calc(${((prior - 0.5) / 10) * 100}% )` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {priorText} {moved}
      </p>
      <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">{rationale}</p>
    </div>
  )
}

function UrgencyBlock({ trace, bands, rules }: { trace: Trace; bands: Bands; rules: Rules | null }) {
  const u = trace.urgency!
  const a = trace.assessment!
  const steps = urgencySteps(
    { base: u.base, gates: u.gates, overrides: u.overrides, score: u.score },
    { likelihood: a.likelihood_of_failure.score, impact: a.impact_of_failure.score },
    trace.equipment.safety_critical_element,
    rules,
  )
  return (
    <div className="max-w-[68ch]">
      <NumberLine base={u.base} score={u.score} bands={bands} ticks={floorTicks(steps, u.overrides, rules)} />
      <UrgencySteps steps={steps} />
    </div>
  )
}

const FLAGS: { key: keyof Assessment; label: string }[] = [
  { key: 'confirmed_failure', label: 'Confirmed failure' },
  { key: 'out_of_service', label: 'Out of service' },
  { key: 'protection_layer_impaired', label: 'Protection layer impaired' },
  { key: 'deviation_recorded', label: 'Deviation recorded' },
  { key: 'evacuation_capacity_reduced', label: 'Evacuation capacity reduced' },
  { key: 'uncertainty', label: 'Uncertainty' },
]

function Flags({ a }: { a: Assessment }) {
  const render = (value: unknown) => {
    if (value === true) return <b className="font-bold text-foreground">Yes</b>
    if (value === false) return <span className="text-muted-foreground">No</span>
    if (value === 'unknown')
      return (
        <span>
          <span className="underline decoration-dotted underline-offset-4">Unknown</span>
          <span className="text-muted-foreground"> treated as not recorded</span>
        </span>
      )
    if (value === 'yes') return <b className="font-bold text-foreground">Yes</b>
    if (value === 'no') return <span className="text-muted-foreground">No</span>
    return <span className={cn(value === 'high' ? 'font-bold text-foreground' : 'text-muted-foreground')}>{String(value)[0].toUpperCase() + String(value).slice(1)}</span>
  }
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {FLAGS.map((f) => (
        <div key={f.key} className="contents">
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd>{render(a[f.key])}</dd>
        </div>
      ))}
    </dl>
  )
}

function Attempts({ trace }: { trace: Trace }) {
  return (
    <div className="text-sm">
      <ol className="grid gap-2">
        {trace.attempts.map((at) => {
          const ok = at.outcome === 'accepted'
          return (
            <li key={at.number} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2">
              {ok ? <CheckIcon className="mt-0.5 size-3.5 text-foreground" /> : <XIcon className="mt-0.5 size-3.5 text-destructive" />}
              <div className="min-w-0">
                <p>
                  <b className="font-bold">Attempt {at.number}</b> <span className={cn(ok ? 'text-muted-foreground' : 'text-destructive')}>{ATTEMPT_OUTCOME[at.outcome] ?? at.outcome}</span>
                  {at.cached && <span className="text-muted-foreground">, from cache</span>}
                </p>
                {!ok && at.detail && <pre className="mt-1 max-w-[68ch] overflow-x-auto rounded-sm bg-muted px-2 py-1.5 font-mono text-xs whitespace-pre-wrap text-muted-foreground">{at.detail}</pre>}
                {at.raw && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Raw reply</summary>
                    <pre className="mt-1 max-h-72 max-w-[68ch] overflow-auto rounded-sm bg-muted px-2 py-1.5 font-mono text-xs whitespace-pre-wrap text-muted-foreground">{pretty(at.raw)}</pre>
                  </details>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">Model {trace.model}.</p>
    </div>
  )
}

function pretty(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

