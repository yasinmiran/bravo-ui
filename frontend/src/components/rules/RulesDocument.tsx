import type { ReactNode } from 'react'

import { BANDS, type AssetSummary, type Bullet, type Dimension, type RegistryScore, type Rules, type RulesDetail } from '@/api'
import { Bad, BandChip, Note, Tag } from '@/components/marks'
import { cn } from '@/lib/utils'

import { count, MISSING_TYPES_ANCHOR, sectionAnchor, sentence, typeAnchor, type SectionId } from './format'
import { SourceBadge, SourceBadges } from './SourceBadge'
import { sharedSource } from './source'

type AssetTypes = AssetSummary['equipment_types']

const PROSE = 'max-w-[68ch]'
const MARKER =
  'relative pl-4 before:absolute before:top-[calc((1lh_-_0.375rem)/2)] before:left-0.5 before:size-1.5 before:rounded-[1px] before:bg-muted-foreground'

export function SourceLegend({ inferred }: { inferred: number }) {
  return (
    <div role="group" aria-label="Source badges" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3 text-xs text-muted-foreground">
      <span className="font-bold text-foreground">Every rule names its source:</span>
      <span className="inline-flex items-center gap-1.5">
        <SourceBadge source={{ kind: 'notes', detail: 'section' }} />
        handover notes
      </span>
      <span className="inline-flex items-center gap-1.5">
        <SourceBadge source={{ kind: 'registry', detail: 'id' }} />
        engineer comment
      </span>
      <span className="inline-flex items-center gap-1.5">
        <SourceBadge source={{ kind: 'inferred', detail: '' }} />
        {inferred ? `a choice to check, ${inferred} in this version` : 'a choice to check'}
      </span>
    </div>
  )
}

export function RulesDocument({ detail, rules, assetTypes }: { detail: RulesDetail; rules: Rules; assetTypes: AssetTypes | undefined }) {
  return (
    <div className="max-w-[calc(68ch+14rem)]">
      <RegistryScores rules={rules} />
      <General rules={rules} />
      <EquipmentTypes detail={detail} rules={rules} assetTypes={assetTypes} />
      <Redundancy rules={rules} />
      <Layers rules={rules} assetTypes={assetTypes} />
      <Urgency rules={rules} />
      <Overrides detail={detail} rules={rules} />
    </div>
  )
}

function Section({ id, title, lede, children }: { id: SectionId; title: string; lede?: ReactNode; children: ReactNode }) {
  const anchor = sectionAnchor(id)
  return (
    <section id={anchor} aria-labelledby={`${anchor}-h`} className="scroll-mt-16 pt-8 not-first:mt-4 not-first:border-t not-first:border-border">
      <h2 id={`${anchor}-h`} tabIndex={-1} className="mb-3 text-lg font-[780] outline-none">
        {title}
      </h2>
      {lede && <p className={cn(PROSE, 'mb-5 text-muted-foreground')}>{lede}</p>}
      {children}
    </section>
  )
}

function BulletList({ bullets, showSources, compact }: { bullets: Bullet[]; showSources: boolean; compact?: boolean }) {
  return (
    <ul className={cn('grid', PROSE, compact ? 'gap-2 text-sm' : 'gap-3')}>
      {bullets.map((b, i) => (
        <li key={i} className={MARKER}>
          {sentence(b.text)}
          {showSources && b.source.trim() && <SourceBadges source={b.source} className="ml-2" />}
        </li>
      ))}
    </ul>
  )
}

/** A heading over bullets. A source every bullet shares sits on the heading instead of on each bullet. */
function BulletGroup({ title, bullets, level = 'h4', compact }: { title: string; bullets: Bullet[]; level?: 'h3' | 'h4'; compact?: boolean }) {
  const shared = sharedSource(bullets)
  const H = level
  return (
    <div>
      <H className={cn('mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-bold', level === 'h3' ? 'text-md' : 'text-sm text-muted-foreground')}>
        {title}
        {shared && <SourceBadges source={shared} />}
      </H>
      {bullets.length ? <BulletList bullets={bullets} showSources={!shared} compact={compact} /> : <Note>None listed.</Note>}
    </div>
  )
}

function Pair({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-border py-3 @min-[36rem]:grid-cols-[10rem_1fr] @min-[36rem]:gap-4">
      <dt className="text-sm font-bold">{term}</dt>
      <dd>{children}</dd>
    </div>
  )
}

const SCORE_MEANING: Record<string, string> = { criticality_score: 'most critical', reliability_score: 'highly reliable' }

function ScoreCard({ name, score }: { name: string; score: RegistryScore }) {
  const [lo, hi] = score.range
  const start = score.starting_point_for
  const inverted = score.direction === 'inverted'
  const meaning = SCORE_MEANING[name] ? `${hi} means ${SCORE_MEANING[name]}` : `a higher score ${inverted ? 'lowers' : 'raises'} ${start}`
  return (
    <div className="rounded-md border border-border p-4">
      <h3 className="font-mono text-sm font-semibold">{name}</h3>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Range</dt>
        <dd className="tabular-nums">
          {lo} to {hi}
        </dd>
        <dt className="text-muted-foreground">Direction</dt>
        <dd>
          {inverted ? (
            <b className="font-bold underline decoration-2 underline-offset-[0.2em]">Inverted: {meaning}</b>
          ) : (
            <>Normal: {meaning}</>
          )}
        </dd>
        <dt className="text-muted-foreground">Starts</dt>
        <dd>
          {sentence(start)} starts at {inverted ? `${lo + hi} minus the score` : 'the score'}
        </dd>
      </dl>
      {score.warning.trim() && <Note className="mt-3">{sentence(score.warning)}</Note>}
    </div>
  )
}

function RegistryScores({ rules }: { rules: Rules }) {
  const { criticality_score, reliability_score, note } = rules.registry_scores
  return (
    <Section id="registry" title="Registry scores" lede="The two registry numbers each finding starts from, before the finding text moves them.">
      <div className="grid gap-4 @min-[36rem]:grid-cols-2">
        <ScoreCard name="criticality_score" score={criticality_score} />
        <ScoreCard name="reliability_score" score={reliability_score} />
      </div>
      {note.trim() && <p className={cn(PROSE, 'mt-4 text-sm text-muted-foreground')}>{sentence(note)}</p>}
    </Section>
  )
}

function DimensionBlock({ title, dim }: { title: string; dim: Dimension }) {
  return (
    <div className="mt-6 first:mt-0">
      <h3 className="mb-2 text-md font-bold">{title}</h3>
      <p className={cn(PROSE, 'text-muted-foreground')}>
        <b className="font-bold text-foreground">Concerns.</b> {sentence(dim.concerns)}
      </p>
      {dim.scope.trim() && (
        <p className={cn(PROSE, 'mt-2 text-muted-foreground')}>
          <b className="font-bold text-foreground">Scope.</b> {sentence(dim.scope)}
        </p>
      )}
      <div className="mt-4 grid gap-6 @min-[36rem]:grid-cols-2">
        <BulletGroup title="Moves it up" bullets={dim.up} compact />
        <BulletGroup title="Moves it down" bullets={dim.down} compact />
      </div>
    </div>
  )
}

function Phrases({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-bold text-muted-foreground">{title}</h4>
      {items.length ? (
        <ul className="grid gap-1.5 text-sm">
          {items.map((item, i) => (
            <li key={i} className={MARKER}>
              {sentence(item)}
            </li>
          ))}
        </ul>
      ) : (
        <Note>None listed.</Note>
      )}
    </div>
  )
}

function General({ rules }: { rules: Rules }) {
  const { likelihood, impact, pitfalls, output } = rules.general
  const { summary } = output
  const musts = [
    summary.readable_without_inspection_record && 'readable without the inspection record',
    summary.not_a_restatement_of_finding_text && 'more than a restatement of the finding text',
  ].filter(Boolean)
  return (
    <Section id="general" title="General" lede="What the model reads for every finding, whatever the equipment.">
      <DimensionBlock title="Likelihood" dim={likelihood} />
      <DimensionBlock title="Impact" dim={impact} />
      <div className="mt-8">
        <BulletGroup title="Pitfalls" bullets={pitfalls} level="h3" />
      </div>
      <h3 className="mt-8 mb-2 text-md font-bold">Output expectations</h3>
      <dl className="grid max-w-[calc(68ch+10rem)]">
        <Pair term="Summary">
          {musts.length > 0 && <p className="mb-3">It must be {musts.join(' and ')}.</p>}
          <div className="grid gap-4 @min-[30rem]:grid-cols-2">
            <Phrases title="Must cover" items={summary.must_cover} />
            <Phrases title="Must not omit" items={summary.must_not_omit} />
          </div>
        </Pair>
        <Pair term="Recommended action">{sentence(output.recommended_action)}</Pair>
        <Pair term="Uncertainty">{sentence(output.uncertainty)}</Pair>
      </dl>
      <h4 className="mt-5 mb-2 text-sm font-bold text-muted-foreground">Loss of confidence, worst first</h4>
      <ol className={cn(PROSE, 'grid gap-1.5')}>
        {output.loss_of_confidence_causes.map((cause, i) => (
          <li key={i} className="grid grid-cols-[1.5rem_1fr]">
            <span className="font-bold text-muted-foreground tabular-nums">{i + 1}</span>
            <span>{sentence(cause)}</span>
          </li>
        ))}
      </ol>
    </Section>
  )
}

function EquipmentTypes({ detail, rules, assetTypes }: { detail: RulesDetail; rules: Rules; assetTypes: AssetTypes | undefined }) {
  const sections = Object.entries(rules.by_equipment_type)
  const assetCount = new Map(assetTypes?.map((t) => [t.name, t.count]))
  const missing = assetTypes?.filter((t) => !(t.name in rules.by_equipment_type))
  const missingFromCoverage = detail.issues.filter((i) => i.code === 'type_without_section')
  const hasMissing = missing ? missing.length > 0 : missingFromCoverage.length > 0
  return (
    <Section id="types" title="Equipment types" lede="One section per equipment type in the assets. The model reads only the section that matches the finding's equipment.">
      {hasMissing && (
        <div id={MISSING_TYPES_ANCHOR} className="mb-2 scroll-mt-16 border-b border-border pb-5">
          <h3 id={`${MISSING_TYPES_ANCHOR}-h`} tabIndex={-1} className="mb-2 text-md font-bold outline-none">
            Missing sections
          </h3>
          <ul className="grid gap-1.5">
            {missing
              ? missing.map((t) => (
                  <li key={t.name}>
                    <Bad>
                      {t.name} has no section, and {count(t.count, 'asset')} {t.count === 1 ? 'uses' : 'use'} this type.
                    </Bad>
                  </li>
                ))
              : missingFromCoverage.map((issue, i) => (
                  <li key={i}>
                    <Bad>{issue.message}</Bad>
                  </li>
                ))}
          </ul>
        </div>
      )}
      {sections.map(([name, bullets], i) => {
        const shared = sharedSource(bullets)
        const assets = assetCount.get(name)
        const anchor = typeAnchor(i)
        return (
          <section
            key={name}
            id={anchor}
            aria-labelledby={`${anchor}-h`}
            className="scroll-mt-16 border-t border-border py-5 first-of-type:border-t-0 first-of-type:pt-1"
          >
            <h3 id={`${anchor}-h`} tabIndex={-1} className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 outline-none">
              <span className="text-md font-bold">{name}</span>
              {assets != null && <span className="text-sm text-muted-foreground">{count(assets, 'asset')}</span>}
              {assets == null && assetTypes && <Note>No asset has this type</Note>}
              {shared && <SourceBadges source={shared} />}
            </h3>
            {bullets.length ? (
              <BulletList bullets={bullets} showSources={!shared} />
            ) : (
              <Note>No rules for this type. The model gets the general rules only.</Note>
            )}
          </section>
        )
      })}
    </Section>
  )
}

const KIND: Record<Rules['redundancy_vocabulary'][string]['kind'], string> = {
  none: 'No redundancy',
  bypass: 'Bypass available',
  voted: 'Voted group',
  partner: 'Redundant partner',
}

function Redundancy({ rules }: { rules: Rules }) {
  const entries = Object.entries(rules.redundancy_vocabulary)
  return (
    <Section id="redundancy" title="Redundancy vocabulary" lede="Every redundancy string in the assets, exactly as written, and how the pipeline reads it. An unrecognised string stops a process.">
      <div className="relative overflow-x-auto">
        <table className="w-full max-w-[calc(68ch+8rem)] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="border-b border-input py-1.5 pr-4 font-medium">
                As written
              </th>
              <th scope="col" className="border-b border-input py-1.5 font-medium">
                Read as
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([value, entry]) => (
              <tr key={value} className="align-top">
                <td className="border-b border-border py-3 pr-4">
                  <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs whitespace-nowrap">{value}</code>
                </td>
                <td className="border-b border-border py-3">
                  <span className="inline-flex flex-wrap items-baseline gap-x-2">
                    <b className="font-bold">{KIND[entry.kind]}</b>
                    {entry.partner && <Tag>{entry.partner}</Tag>}
                  </span>
                  {entry.note.trim() && <span className="mt-0.5 block text-muted-foreground">{sentence(entry.note)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function Chips({ title, items, known, empty }: { title: string; items: string[]; known: Set<string> | null; empty: string }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-muted-foreground">{title}</h3>
      {items.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((t) => {
            const unknown = known != null && !known.has(t)
            return (
              <li
                key={t}
                title={unknown ? 'No asset has this type' : undefined}
                className={cn('inline-flex min-h-6 items-center rounded-sm border bg-muted px-2 text-sm', unknown ? 'border-dashed border-input' : 'border-border')}
              >
                {t}
              </li>
            )
          })}
        </ul>
      ) : (
        <Note>{empty}</Note>
      )}
    </div>
  )
}

function Layers({ rules, assetTypes }: { rules: Rules; assetTypes: AssetTypes | undefined }) {
  const known = assetTypes ? new Set(assetTypes.map((t) => t.name)) : null
  return (
    <Section id="layers" title="Protection layers and evacuation" lede="The overrides fire only for equipment of these types.">
      <div className="grid gap-6 @min-[36rem]:grid-cols-2">
        <Chips title="Protection layer types" items={rules.protection_layer_types} known={known} empty="None listed, so the protection layer override never fires." />
        <Chips title="Evacuation types" items={rules.evacuation_types} known={known} empty="None listed, so the evacuation override never fires." />
      </div>
    </Section>
  )
}

function Urgency({ rules }: { rules: Rules }) {
  const { weights, near_certain, inconsequential, sce_floor } = rules.urgency
  return (
    <Section id="urgency" title="Urgency" lede="Urgency is computed in code, never by the model. Likelihood and impact go in; these numbers decide the score and its band.">
      <div className="grid items-start gap-8 @min-[44rem]:grid-cols-[auto_1fr]">
        <table className="text-sm">
          <caption className="pb-2 text-left font-bold text-muted-foreground">Bands</caption>
          <tbody>
            {BANDS.map((b) => {
              const [lo, hi] = rules.urgency_bands[b.name]
              return (
                <tr key={b.name}>
                  <td className="py-1 pr-6">
                    <BandChip band={b.name} />
                  </td>
                  <td className="py-1 font-bold whitespace-nowrap tabular-nums">{lo === hi ? lo : `${lo} to ${hi}`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <dl className="grid">
          <Pair term="Weights">
            <b className="tabular-nums">{weights.impact}</b> impact, <b className="tabular-nums">{weights.likelihood}</b> likelihood
          </Pair>
          <Pair term="Near-certain gate">
            Likelihood at least <b>{near_certain.likelihood_at_least}</b> lifts the base to at least the impact score
          </Pair>
          <Pair term="Inconsequential cap">
            Impact at most <b>{inconsequential.impact_at_most}</b> caps urgency at <b>{inconsequential.urgency_at_most}</b>
          </Pair>
          <Pair term="SCE floor">
            Impact at least <b>{sce_floor.impact_at_least}</b> on a Safety Critical Element floors urgency at <b>{sce_floor.urgency_at_least}</b>
          </Pair>
        </dl>
      </div>
    </Section>
  )
}

function Overrides({ detail, rules }: { detail: RulesDetail; rules: Rules }) {
  const missing = detail.issues.filter((i) => i.code === 'override_missing')
  return (
    <Section id="overrides" title="Overrides" lede="An override lifts the derived urgency to a floor when its condition holds. It never lowers it.">
      <ul className="grid max-w-[calc(68ch+8rem)] gap-4">
        {rules.overrides.map((o) => (
          <li key={o.id} className="grid gap-2 rounded-xl border border-input px-5 py-4">
            <h3 className="font-mono text-sm font-semibold break-all">{o.id}</h3>
            <OverrideLine label="When">{o.condition}</OverrideLine>
            <OverrideLine label="Because">{o.reason}</OverrideLine>
            <OverrideLine label="Effect">
              Urgency at least <b>{o.floor}</b>
            </OverrideLine>
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <ul className="mt-4 grid gap-1.5">
          {missing.map((issue, i) => (
            <li key={i}>
              <Note>{issue.message}</Note>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function OverrideLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="grid grid-cols-[4.5rem_1fr] gap-2">
      <span className="pt-0.5 text-sm text-muted-foreground">{label}</span>
      <span>{children}</span>
    </p>
  )
}
