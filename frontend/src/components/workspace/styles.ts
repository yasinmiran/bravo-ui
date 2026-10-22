/** Table cells shared by the step tables: sunk header, hairline rows, 12px row padding. */
export const th =
  'border-b border-border bg-muted px-3 py-2 text-left align-bottom text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4'
export const td = 'border-b border-border px-3 py-2 align-middle first:pl-4 last:pr-4'
export const tbody = '[&>tr:last-child>td]:border-b-0'

/** Outline buttons get the 3:1 control boundary instead of the decorative hairline. */
export const outline = 'border-input'
