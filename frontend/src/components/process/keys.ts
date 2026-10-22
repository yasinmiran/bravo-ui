const CONTROL =
  'button, a[href], input, textarea, select, summary, [contenteditable=""], [contenteditable="true"], [role="tab"], [role="combobox"], [role="option"], [role="menuitem"], [role="switch"], [role="radio"], [role="checkbox"], [role="dialog"]'

export function onControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest(CONTROL) !== null
}

/**
 * Whether a one-key shortcut may fire for this event target. Typing fields never give
 * their keys up; other controls keep them unless they sit inside `scope`, the list or
 * panel the shortcut belongs to.
 */
export function shortcutFree(target: EventTarget | null, scope?: HTMLElement | null): boolean {
  if (!(target instanceof HTMLElement)) return true
  if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return false
  const control = target.closest(CONTROL)
  if (!control) return true
  return !!scope && scope.contains(control)
}
