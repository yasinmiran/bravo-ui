import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useTheme, type ThemeMode } from '@/theme'

const MODES: { mode: ThemeMode; label: string; Icon: typeof SunIcon }[] = [
  { mode: 'light', label: 'Light', Icon: SunIcon },
  { mode: 'system', label: 'Follow the system', Icon: MonitorIcon },
  { mode: 'dark', label: 'Dark', Icon: MoonIcon },
]

export function ThemeSwitch({ className }: { className?: string }) {
  const { mode, setMode } = useTheme()
  return (
    <div role="radiogroup" aria-label="Theme" className={cn('inline-flex rounded-lg border bg-background p-0.5', className)}>
      {MODES.map(({ mode: m, label, Icon }) => (
        <Tooltip key={m}>
          <TooltipTrigger asChild>
            <button
              type="button"
              role="radio"
              aria-checked={mode === m}
              aria-label={label}
              onClick={() => setMode(m)}
              className={cn(
                'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
                mode === m && 'bg-muted text-foreground',
              )}
            >
              <Icon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
