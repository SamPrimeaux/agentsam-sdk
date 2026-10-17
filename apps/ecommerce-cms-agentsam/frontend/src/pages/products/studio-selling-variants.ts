/**
 * Selection of sellable catalog variants is independent from the preview variant.
 * Keep provider variant IDs in catalog order; never generate Cartesian products
 * that the supplier did not actually return.
 */
export function orderedVariantIds(catalogIds: readonly string[], selected: Iterable<string>): string[] {
  const current = new Set(selected);
  return catalogIds.filter((id) => Boolean(id) && current.has(id));
}

export function updateSellingVariants(
  catalogIds: readonly string[],
  selected: readonly string[],
  affectedIds: readonly string[],
  include: boolean,
): string[] {
  const next = new Set(selected);
  for (const id of affectedIds) {
    if (include) next.add(id);
    else next.delete(id);
  }
  return orderedVariantIds(catalogIds, next);
}

export function toggleSellingGroup(
  catalogIds: readonly string[],
  selected: readonly string[],
  groupIds: readonly string[],
): string[] {
  if (!groupIds.length) return orderedVariantIds(catalogIds, selected);
  const selectedSet = new Set(selected);
  return updateSellingVariants(catalogIds, selected, groupIds,
    !groupIds.every((id) => selectedSet.has(id)));
}
