/**
 * Non-destructive print readiness adjustment. A smaller physical placement
 * raises effective *source* PPI; upscaling raster pixels does not.
 * Larger deficits require a better source rather than silently shrinking a
 * merchant's artwork into an unusably tiny design.
 */
export function suggestPrintScale(input: {
  currentScale: number;
  effectivePpi: number | null | undefined;
  targetPpi: number | null | undefined;
  minimumScale?: number;
  maximumReductionFraction?: number;
}): number | null {
  const { currentScale, effectivePpi, targetPpi } = input;
  const minimumScale = input.minimumScale ?? 5;
  const maximumReductionFraction = input.maximumReductionFraction ?? 0.25;
  if (![currentScale, effectivePpi, targetPpi, minimumScale].every((n) => Number.isFinite(n) && Number(n) > 0) ||
      !Number.isFinite(maximumReductionFraction) || maximumReductionFraction < 0 || maximumReductionFraction >= 1) return null;
  if (Number(effectivePpi) >= Number(targetPpi)) return null;
  // 0.995 provides margin for rounded supplier inputs and export precision.
  const recommended = Math.floor((currentScale * Number(effectivePpi) / Number(targetPpi) * 0.995) * 10) / 10;
  if (recommended < minimumScale || recommended < currentScale * (1 - maximumReductionFraction) ||
      recommended >= currentScale) return null;
  return recommended;
}
