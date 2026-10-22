import { CheckIcon, InfoIcon, OctagonXIcon } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'

import type { AssetSummary, Rules } from '@/api'
import { cn } from '@/lib/utils'

import { MISSING_TYPES_ANCHOR, SECTIONS, sectionAnchor, typeAnchor, type SectionId } from './format'

/** The section whose heading band is nearest the top of the viewport, below the sticky top bar. */
function useActiveSection(enabled: boolean): SectionId | null {
  const [active, setActive] = useState<SectionId | null>(null)
  useEffect(() => {
    if (!enabled) return
    const visible = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting)
        const first = SECTIONS.find((s) => visible.get(sectionAnchor(s.id)))
        if (first) setActive(first.id)
      },
      { rootMargin: '-64px 0px -60% 0px' },
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(sectionAnchor(s.id))
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [enabled])
  return active
}

const link = 'flex items-center gap-2 rounded-md text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground'

export function RulesNav({
  rules,
  assetTypes,
  observing,
  onJump,
}: {
  rules: Rules
  assetTypes: AssetSummary['equipment_types'] | undefined
  observing: boolean
  onJump: (anchor: string) => void
}) {
  const active = useActiveSection(observing)
  const sections = Object.keys(rules.by_equipment_type)
  const assetNames = new Set(assetTypes?.map((t) => t.name))
  const missing = assetTypes?.filter((t) => !(t.name in rules.by_equipment_type)).map((t) => t.name) ?? []
  const total = assetTypes?.length ?? sections.length
  const covered = total - missing.length

  const jump = (anchor: string) => (e: MouseEvent) => {
    e.preventDefault()
    onJump(anchor)
  }

  return (
    <nav aria-label="Rules sections" className="pb-6 text-sm">
      <ul className="grid gap-0.5">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${sectionAnchor(s.id)}`}
              onClick={jump(sectionAnchor(s.id))}
              aria-current={active === s.id ? 'location' : undefined}
              className={cn(link, 'min-h-8 px-3 aria-[current]:bg-card aria-[current]:font-bold aria-[current]:text-foreground aria-[current]:shadow-[inset_0_0_0_1px_var(--border)]')}
            >
              {s.label}
              {s.id === 'types' && (
                <span className={cn('ml-auto text-xs font-normal tabular-nums', missing.length ? 'text-destructive' : 'text-muted-foreground')}>
                  {covered} of {total}
                  <span className="sr-only"> covered</span>
                </span>
              )}
            </a>
            {s.id === 'types' && (
              <ul className="mt-0.5 mb-1 ml-3 grid">
                {missing.map((name) => (
                  <li key={name}>
                    <a href={`#${MISSING_TYPES_ANCHOR}`} onClick={jump(MISSING_TYPES_ANCHOR)} className={cn(link, 'min-h-7 px-2 text-xs text-destructive')}>
                      <OctagonXIcon aria-hidden className="size-3 shrink-0" />
                      <span className="truncate">{name}</span>
                      <span className="sr-only">, no section</span>
                    </a>
                  </li>
                ))}
                {sections.map((name, i) => {
                  const orphan = assetTypes != null && !assetNames.has(name)
                  return (
                    <li key={name}>
                      <a href={`#${typeAnchor(i)}`} onClick={jump(typeAnchor(i))} className={cn(link, 'min-h-7 px-2 text-xs')}>
                        {orphan ? <InfoIcon aria-hidden className="size-3 shrink-0" /> : <CheckIcon aria-hidden className="size-3 shrink-0 text-ok" />}
                        <span className="truncate">{name}</span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
