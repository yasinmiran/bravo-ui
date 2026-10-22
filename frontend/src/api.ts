import { useEffect, useRef, useState } from 'react'

// ---------- shared vocabulary ----------

export type BandName = 'today' | 'this_week' | 'this_month' | 'next_planned_shutdown' | 'backlog'
export type Decision = 'pending' | 'approved' | 'rejected'
export type RulesStatus = 'extracting' | 'draft' | 'approved' | 'failed'
export type ProcessStatus = 'running' | 'done' | 'failed'
export type EventStatus = 'start' | 'done' | 'fail' | 'info'

export const BANDS: { name: BandName; label: string }[] = [
  { name: 'today', label: 'Today' },
  { name: 'this_week', label: 'This week' },
  { name: 'this_month', label: 'This month' },
  { name: 'next_planned_shutdown', label: 'Next shutdown' },
  { name: 'backlog', label: 'Backlog' },
]

export const DEFAULT_BANDS: Record<BandName, [number, number]> = {
  today: [9, 10],
  this_week: [7, 8],
  this_month: [5, 6],
  next_planned_shutdown: [3, 4],
  backlog: [1, 2],
}

export type BandKey = 'today' | 'week' | 'month' | 'shutdown' | 'backlog' | 'none'

export function bandKey(name: BandName | string | null | undefined): BandKey {
  switch (name) {
    case 'today':
      return 'today'
    case 'this_week':
      return 'week'
    case 'this_month':
      return 'month'
    case 'next_planned_shutdown':
      return 'shutdown'
    case 'backlog':
      return 'backlog'
    default:
      return 'none'
  }
}

export const bandLabel = (name: BandName | string | null | undefined) => BANDS.find((b) => b.name === name)?.label ?? 'Unscored'

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return ''
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m} min ${s} s`
}

// ---------- API shapes ----------

export interface WorkspaceSummary {
  id: string
  name: string
  created_at: string
  updated_at: string
  has_document: boolean
  assets: number
  approved_rules: number
  processes: number
  running_processes: number
  last_process_at: string | null
  tickets: number
  pending_tickets: number
}

export interface DocumentSummary {
  filename: string
  uploaded_at: string
  chars: number
  lines: number
  sections: number
}

export interface Asset {
  equipment_id: string
  equipment_type: string
  service_description: string
  criticality_score: number
  reliability_score: number
  safety_critical_element: boolean
  redundancy: string
  engineer_comment: string
  position: number
  updated_at: string
}

export type AssetInput = Omit<Asset, 'position' | 'updated_at'>
export type AssetPatch = Partial<Omit<AssetInput, 'equipment_id'>>

export interface AssetSummary {
  count: number
  safety_critical: number
  equipment_types: { name: string; count: number }[]
  redundancy_values: { value: string; count: number }[]
  updated_at: string | null
}

export interface AssetsResponse {
  assets: Asset[]
  summary: AssetSummary
}

export interface Issue {
  level: 'error' | 'warning'
  code: string
  message: string
}

export interface Coverage {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
}

export interface RulesVersionSummary {
  id: string
  version: number
  status: RulesStatus
  origin: 'extracted' | 'edited'
  error: string | null
  created_at: string
  meta: {
    model?: string
    usage?: Usage
    attempts?: { number: number; outcome: string; detail: string; cached: boolean }[]
    issues?: Issue[]
    edited_from?: string
    ms?: number
  }
}

export interface ProcessSummary {
  id: string
  workspace_id: string
  rules_version_id: string
  number: number
  status: ProcessStatus
  model: string
  error: string | null
  started_at: string
  finished_at: string | null
  counts: { queued: number; running: number; done: number; failed: number }
  total: number
  filename: string | null
  findings_count: number
  rules_version: number | null
}

export interface WorkspaceDetail {
  id: string
  name: string
  created_at: string
  updated_at: string
  document: DocumentSummary | null
  assets: AssetSummary
  rules_versions: RulesVersionSummary[]
  approved: { id: string; version: number; coverage: Coverage } | null
  processes: ProcessSummary[]
}

export interface FindingRecord {
  finding_id: string
  reported_date: string
  equipment_id: string
  equipment_type: string
  inspection_type: string
  inspection_method: string
  finding_description: string
  reported_by: string
  reporter_role: string
}

export interface FindingsPreview {
  filename: string
  rows: number
  problems: string[]
  unknown_equipment: { finding_id: string; equipment_id: string }[]
  type_mismatches: { finding_id: string; equipment_id: string; finding_type: string; asset_type: string }[]
  ok: boolean
  findings: FindingRecord[]
}

export interface Bullet {
  text: string
  source: string
}

export interface Dimension {
  concerns: string
  scope: string
  up: Bullet[]
  down: Bullet[]
}

export interface RegistryScore {
  range: number[]
  direction: 'normal' | 'inverted'
  starting_point_for: 'impact' | 'likelihood'
  warning: string
}

export interface Rules {
  version: number
  source: string
  registry_scores: {
    criticality_score: RegistryScore
    reliability_score: RegistryScore
    note: string
  }
  general: {
    likelihood: Dimension
    impact: Dimension
    pitfalls: Bullet[]
    output: {
      summary: {
        must_cover: string[]
        readable_without_inspection_record: boolean
        not_a_restatement_of_finding_text: boolean
        must_not_omit: string[]
      }
      recommended_action: string
      uncertainty: string
      loss_of_confidence_causes: string[]
    }
  }
  by_equipment_type: Record<string, Bullet[]>
  redundancy_vocabulary: Record<string, { kind: 'none' | 'bypass' | 'voted' | 'partner'; partner: string; note: string }>
  protection_layer_types: string[]
  evacuation_types: string[]
  urgency_bands: Record<BandName, [number, number]>
  urgency: {
    weights: { impact: number; likelihood: number }
    near_certain: { likelihood_at_least: number }
    inconsequential: { impact_at_most: number; urgency_at_most: number }
    sce_floor: { impact_at_least: number; urgency_at_least: number }
  }
  overrides: { id: string; condition: string; reason: string; floor: number }[]
}

export interface RulesDetail extends RulesVersionSummary {
  workspace_id: string
  yaml: string | null
  rules: Rules | null
  issues: Issue[]
  parse_error: string | null
  coverage: Coverage
  approvable: boolean
}

export interface ScoredDimension {
  score: number
  rationale: string
}

export interface Ticket {
  ticket_id: string
  finding_id: string
  equipment_id: string
  summary: string
  likelihood_of_failure: ScoredDimension
  impact_of_failure: ScoredDimension
  urgency: ScoredDimension
  recommended_action: string
  review_required: boolean
  review_reason: string | null
}

export interface TicketRow {
  id: string
  process_id: string
  position: number
  ticket: Ticket
  decision: Decision
  decision_note: string | null
  decided_at: string | null
  band: BandName | null
  equipment_type: string | null
  safety_critical_element: boolean | null
  overrides: string[]
  attempts: number
}

export interface Assessment {
  summary: string
  likelihood_of_failure: ScoredDimension
  impact_of_failure: ScoredDimension
  recommended_action: string
  confirmed_failure: boolean
  out_of_service: boolean
  protection_layer_impaired: boolean
  deviation_recorded: 'yes' | 'no' | 'unknown'
  evacuation_capacity_reduced: boolean
  uncertainty: 'low' | 'medium' | 'high'
}

export interface Gate {
  id: string
  name: string
  condition: string
  applied: boolean
  value: number
}

export interface FiredOverride {
  id: string
  evidence: string
  reason: string
  floor: number
}

export interface UrgencyTrace {
  base: number
  steps: string[]
  gates: Gate[]
  derived: number
  score: number
  band: BandName
  overrides: FiredOverride[]
}

export interface Trace {
  finding: FindingRecord
  equipment: Omit<Asset, 'position' | 'updated_at'>
  notes: { kind: string; text: string }[]
  prompt: { system: string; user: string }
  attempts: { number: number; outcome: 'accepted' | 'validation_error' | 'invariant_violation' | 'model_error'; detail: string; raw: string; cached: boolean }[]
  model: string
  assessment: Assessment | null
  violations: string[]
  urgency: UrgencyTrace | null
  review: { required: boolean; reasons: string[] }
}

export interface TicketDetail {
  id: string
  process_id: string
  position: number
  ticket: Ticket
  decision: Decision
  decision_note: string | null
  decided_at: string | null
  trace: Trace
}

export interface ProcessDetail extends ProcessSummary {
  progress: Record<string, 'queued' | 'running' | 'done' | 'failed'>
  bands: Record<BandName, [number, number]> | null
  input: {
    filename: string
    findings: FindingRecord[]
    /** Registry facts for every equipment id that has a finding, so lanes can show type and SCE before a ticket exists. */
    equipment: Record<string, { equipment_type: string; safety_critical_element: boolean; criticality_score: number; reliability_score: number }>
    assets: number
    type_mismatches: FindingsPreview['type_mismatches']
    rules_version: number | null
    workers: number
    fake_model: boolean
  }
  tickets: TicketRow[]
}

export interface InvariantCheck {
  id: string
  name: string
  applies: boolean
  passed: boolean
  message: string
}

/** One row of the pipeline story. `detail` depends on the stage; see PROCESS_STAGES. */
export interface StageEvent {
  id: number
  job_id: string
  ts: string
  finding_id: string | null
  stage: string
  status: EventStatus
  title: string
  detail: Record<string, unknown> & {
    // model
    model?: string
    attempt?: number
    ms?: number
    cached?: boolean
    usage?: Usage
    max_tokens?: number
    stream?: boolean
    error?: string
    // validate / invariants / coverage
    errors?: string | string[]
    retry?: boolean
    checks?: InvariantCheck[]
    warnings?: string[]
    // notes
    notes?: { kind: string; text: string }[]
    kinds?: string[]
    // prompt
    system_chars?: number
    user_chars?: number
    section?: string
    // urgency / review / ticket
    base?: number
    gates?: Gate[]
    score?: number
    band?: BandName
    overrides?: FiredOverride[]
    likelihood?: number
    impact?: number
    reasons?: string[]
    ticket_id?: string
    review_required?: boolean
    // process level
    worker?: string
    workers?: number
    findings?: number
    assets?: number
    tickets?: number
    failed?: number
    bands?: Record<string, number>
    // extraction
    sections?: string[] | number
    equipment_types?: string[]
    redundancy_values?: string[]
    required_keys?: string[]
    version?: number
  }
}

/** The per-finding ladder, in pipeline order. Process-level stages are listed separately. */
export const FINDING_STAGES = [
  { id: 'intake', label: 'Intake' },
  { id: 'notes', label: 'Batch notes' },
  { id: 'prompt', label: 'Prompt' },
  { id: 'model', label: 'Model call' },
  { id: 'validate', label: 'Validate' },
  { id: 'invariants', label: 'Invariants' },
  { id: 'urgency', label: 'Urgency' },
  { id: 'review', label: 'Review' },
  { id: 'ticket', label: 'Ticket' },
] as const

export const PROCESS_STAGES = [...FINDING_STAGES, { id: 'finish', label: 'Finish' }] as const

export const EXTRACTION_STAGES = [
  { id: 'intake', label: 'Intake' },
  { id: 'schema', label: 'Schema' },
  { id: 'model', label: 'Model call' },
  { id: 'validate', label: 'Validate' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'draft', label: 'Draft' },
] as const

export type FindingStage = (typeof FINDING_STAGES)[number]['id']

/** Where a finding stands: the last stage it has an event for, and whether that stage is still open. */
export function findingPosition(events: StageEvent[]): { stage: FindingStage | 'queued' | 'picked'; open: boolean; failed: boolean } {
  let stage: FindingStage | 'queued' | 'picked' = 'queued'
  let open = false
  let failed = false
  for (const e of events) {
    if (e.stage === 'finding') {
      if (stage === 'queued') stage = 'picked'
      continue
    }
    if (FINDING_STAGES.some((s) => s.id === e.stage)) {
      stage = e.stage as FindingStage
      open = e.status === 'start'
      if (e.stage === 'ticket' && e.status === 'fail') failed = true
    }
  }
  return { stage, open, failed }
}

export function groupByFinding(events: StageEvent[]): Map<string, StageEvent[]> {
  const out = new Map<string, StageEvent[]>()
  for (const e of events) {
    if (!e.finding_id) continue
    const list = out.get(e.finding_id)
    if (list) list.push(e)
    else out.set(e.finding_id, [e])
  }
  return out
}

// ---------- auth ----------

const PASSPHRASE_KEY = 'triage.passphrase'
export const LOGOUT_EVENT = 'triage:logout'

export function getPassphrase(): string | null {
  try {
    return localStorage.getItem(PASSPHRASE_KEY)
  } catch {
    return null
  }
}

export function setPassphrase(value: string | null) {
  try {
    if (value) localStorage.setItem(PASSPHRASE_KEY, value)
    else localStorage.removeItem(PASSPHRASE_KEY)
  } catch {
    /* private window */
  }
}

export function logout() {
  setPassphrase(null)
  window.dispatchEvent(new Event(LOGOUT_EVENT))
}

// ---------- transport ----------

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const passphrase = getPassphrase()
  if (passphrase) headers.set('X-Passphrase', passphrase)
  const res = await fetch(url, { ...init, headers })
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* plain text body */
  }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) logout()
    const detail = body && typeof body === 'object' && 'detail' in body ? (body as { detail: unknown }).detail : body
    const message =
      typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object' && 'message' in detail
          ? String((detail as { message: unknown }).message)
          : JSON.stringify(detail)
    throw new ApiError(res.status, message, detail)
  }
  return body as T
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const upload = (method: string, file: File, fields?: Record<string, string>): RequestInit => {
  const form = new FormData()
  form.append('file', file)
  for (const [k, v] of Object.entries(fields ?? {})) form.append(k, v)
  return { method, body: form }
}

export const api = {
  login: (passphrase: string) => request<void>('/api/auth/login', json('POST', { passphrase })),
  health: () =>
    request<{ ok: boolean; fake_model: boolean; fake_delay: number; api_key: boolean; assess_model: string; extract_model: string; workers: number }>('/api/health'),

  workspaces: () => request<WorkspaceSummary[]>('/api/workspaces'),
  createWorkspace: (name: string) => request<WorkspaceDetail>('/api/workspaces', json('POST', { name })),
  createBravo: () => request<WorkspaceDetail>('/api/workspaces/bravo-example', json('POST')),
  workspace: (id: string) => request<WorkspaceDetail>(`/api/workspaces/${id}`),
  deleteWorkspace: (id: string) => request<void>(`/api/workspaces/${id}`, { method: 'DELETE' }),

  uploadDocument: (id: string, file: File) => request<WorkspaceDetail>(`/api/workspaces/${id}/document`, upload('PUT', file)),
  document: (id: string) => request<{ filename: string; content: string; uploaded_at: string }>(`/api/workspaces/${id}/document`),

  assets: (id: string) => request<AssetsResponse>(`/api/workspaces/${id}/assets`),
  importAssets: (id: string, file: File) => request<AssetsResponse>(`/api/workspaces/${id}/assets/import`, upload('PUT', file)),
  addAsset: (id: string, asset: AssetInput) => request<AssetsResponse>(`/api/workspaces/${id}/assets`, json('POST', asset)),
  editAsset: (id: string, equipmentId: string, patch: AssetPatch) =>
    request<AssetsResponse>(`/api/workspaces/${id}/assets/${encodeURIComponent(equipmentId)}`, json('PATCH', patch)),
  deleteAsset: (id: string, equipmentId: string) =>
    request<AssetsResponse>(`/api/workspaces/${id}/assets/${encodeURIComponent(equipmentId)}`, { method: 'DELETE' }),

  extractRules: (id: string) => request<RulesDetail>(`/api/workspaces/${id}/rules/extract`, json('POST')),
  createRules: (id: string, yaml: string) => request<RulesDetail>(`/api/workspaces/${id}/rules`, json('POST', { yaml })),
  rules: (rid: string) => request<RulesDetail>(`/api/rules/${rid}`),
  editRules: (rid: string, yaml: string) => request<RulesDetail>(`/api/rules/${rid}`, json('PUT', { yaml })),
  approveRules: (rid: string) => request<RulesDetail>(`/api/rules/${rid}/approve`, json('POST')),

  previewFindings: (id: string, file: File) => request<FindingsPreview>(`/api/workspaces/${id}/processes/preview`, upload('POST', file)),
  submitProcess: (id: string, file: File, rulesVersionId: string) =>
    request<ProcessDetail>(`/api/workspaces/${id}/processes`, upload('POST', file, { rules_version_id: rulesVersionId })),
  process: (pid: string) => request<ProcessDetail>(`/api/processes/${pid}`),
  exportUrl: (pid: string, only: 'all' | 'approved') => `/api/processes/${pid}/export?only=${only}`,
  bravoFindings: async (): Promise<File> => {
    const text = await request<string>('/api/examples/bravo-findings.csv')
    return new File([text], 'inspection_findings.csv', { type: 'text/csv' })
  },

  ticket: (ticketId: string) => request<TicketDetail>(`/api/tickets/${ticketId}`),
  decide: (ticketId: string, decision: Decision, note: string) =>
    request<TicketDetail>(`/api/tickets/${ticketId}/decision`, json('POST', { decision, note })),

  events: (jobId: string, after = 0) => request<{ events: StageEvent[]; finished: boolean }>(`/api/jobs/${jobId}/events?after=${after}`),
  eventStreamUrl: (jobId: string, after: number) =>
    `/api/jobs/${jobId}/events/stream?after=${after}&key=${encodeURIComponent(getPassphrase() ?? '')}`,
}

/** Downloads a file through fetch so the passphrase header travels with it. */
export async function download(url: string, filename: string) {
  const headers = new Headers()
  const passphrase = getPassphrase()
  if (passphrase) headers.set('X-Passphrase', passphrase)
  const res = await fetch(url, { headers })
  if (!res.ok) throw new ApiError(res.status, 'download failed', null)
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.style.display = 'none'
  document.body.append(a)
  a.click()
  a.remove()
  // Safari drops the download when the URL is revoked before the click has settled.
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}

// ---------- live events ----------

export interface JobEvents {
  events: StageEvent[]
  finished: boolean
  live: boolean
}

/**
 * Replays the stored events for a job, then follows the stream until the job ends.
 * Dedupes by event id, so a StrictMode double mount or a reconnect never doubles a row.
 */
export function useJobEvents(jobId: string | null | undefined): JobEvents {
  const [state, setState] = useState<{ jobId: string | null; events: StageEvent[]; finished: boolean; live: boolean }>({
    jobId: null,
    events: [],
    finished: false,
    live: false,
  })
  const seen = useRef(new Set<number>())

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    let source: EventSource | null = null
    let cursor = 0
    seen.current = new Set()

    const patch = (change: Partial<{ finished: boolean; live: boolean }>) =>
      setState((prev) => (prev.jobId === jobId ? { ...prev, ...change } : { jobId, events: [], finished: false, live: false, ...change }))

    const push = (batch: StageEvent[]) => {
      const fresh = batch.filter((e) => !seen.current.has(e.id))
      if (!fresh.length) return
      for (const e of fresh) {
        seen.current.add(e.id)
        cursor = Math.max(cursor, e.id)
      }
      setState((prev) =>
        prev.jobId === jobId ? { ...prev, events: [...prev.events, ...fresh] } : { jobId, events: fresh, finished: false, live: false },
      )
    }

    api
      .events(jobId)
      .then(({ events: stored, finished: done }) => {
        if (cancelled) return
        push(stored)
        if (done) {
          patch({ finished: true })
          return
        }
        source = new EventSource(api.eventStreamUrl(jobId, cursor))
        source.onopen = () => patch({ live: true })
        source.addEventListener('stage', (m) => push([JSON.parse((m as MessageEvent).data) as StageEvent]))
        source.addEventListener('end', () => {
          patch({ finished: true, live: false })
          source?.close()
        })
      })
      .catch(() => {
        /* the caller's query surfaces the error */
      })

    return () => {
      cancelled = true
      source?.close()
    }
  }, [jobId])

  if (!jobId || state.jobId !== jobId) return { events: [], finished: false, live: false }
  return { events: state.events, finished: state.finished, live: state.live }
}
