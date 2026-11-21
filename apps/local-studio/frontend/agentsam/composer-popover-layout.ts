/** Geometry only: keep the picker inside the visible window (including iOS keyboard). */
export type ComposerPopoverPlacement = 'above' | 'below';

export function resolveComposerPopoverLayout({
  anchorTop,
  anchorBottom,
  visibleTop,
  visibleBottom,
  gap = 8,
}: {
  anchorTop: number;
  anchorBottom: number;
  visibleTop: number;
  visibleBottom: number;
  gap?: number;
}): { placement: ComposerPopoverPlacement; maxHeight: number } {
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  const spaceAbove = Math.max(0, anchorTop - visibleTop - gap);
  const spaceBelow = Math.max(0, visibleBottom - anchorBottom - gap);
  // Prefer the area above the composer. Use below only when the top cannot
  // present a usable menu and there is genuinely more room below.
  const minUseful = Math.min(112, visibleHeight * 0.3);
  const placement = spaceAbove >= minUseful || spaceAbove >= spaceBelow ? 'above' : 'below';
  const space = placement === 'above' ? spaceAbove : spaceBelow;
  return { placement, maxHeight: Math.floor(Math.min(space, visibleHeight * 0.7)) };
}
