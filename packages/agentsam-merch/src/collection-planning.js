/**
 * Portable product assortment recipes and deterministic storefront membership.
 * Merch packages own merchandising semantics, not application routes, storage
 * credentials, media URLs, or provider API transport.
 */
export const MERCH_ASSORTMENT_RECIPES = Object.freeze([
  Object.freeze({
    id: "tees", label: "Tee drop", caption: "Heavyweight + classic + long sleeve",
    slots: Object.freeze(["heavyweight-tee", "classic-tee", "long-sleeve"]),
  }),
  Object.freeze({
    id: "apparel", label: "Apparel essentials", caption: "Tee + crewneck + hoodie",
    slots: Object.freeze(["heavyweight-tee", "crewneck", "hoodie"]),
  }),
  Object.freeze({
    id: "accessories", label: "Lifestyle accessories", caption: "Headwear + drinkware + sticker",
    slots: Object.freeze(["headwear", "drinkware", "sticker"]),
  }),
]);
const SLOT_TERMS = Object.freeze({
  "heavyweight-tee": "Comfort Colors 1717",
  "classic-tee": "unisex t-shirt",
  "long-sleeve": "long sleeve",
  "crewneck": "crewneck sweatshirt",
  "hoodie": "hoodie",
  "headwear": "trucker hat",
  "drinkware": "tumbler",
  "sticker": "sticker",
});
export function assortmentSearchTerms(recipe) {
  const found = MERCH_ASSORTMENT_RECIPES.find(item => item.id === recipe);
  if (!found) throw new TypeError("Unknown assortment recipe");
  return [...new Set(found.slots.map(slot => SLOT_TERMS[slot]).filter(Boolean))];
}
export const DEFAULT_COLLECTION_RULES = Object.freeze({
  mode: "manual", match: "all", conditions: Object.freeze([]), excludedIds: Object.freeze([]),
});
const FIELDS = Object.freeze(["title", "slug", "collection"]);
const OPERATORS = Object.freeze(["contains", "equals", "starts_with"]);

export function normalizeCollectionRules(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid collection rules");
  const mode = input.mode ?? "manual";
  const match = input.match ?? "all";
  if (!["manual", "automatic", "hybrid"].includes(mode)) throw new TypeError("Invalid membership mode");
  if (!["all", "any"].includes(match)) throw new TypeError("Invalid rule matching logic");
  const raw = input.conditions ?? [];
  if (!Array.isArray(raw) || raw.length > 8) throw new TypeError("Too many collection conditions");
  const conditions = raw.map(condition => {
    if (!condition || typeof condition !== "object" || Array.isArray(condition) ||
        !FIELDS.includes(condition.field) || !OPERATORS.includes(condition.operator))
      throw new TypeError("Unsupported collection condition");
    const value = String(condition.value ?? "").trim().slice(0, 100);
    if (!value) throw new TypeError("Collection rules require non-empty values");
    return { field: condition.field, operator: condition.operator, value };
  });
  if (mode !== "manual" && !conditions.length)
    throw new TypeError("Automatic membership needs at least one condition");
  const rawExclude = input.excludedIds ?? [];
  if (!Array.isArray(rawExclude) || rawExclude.length > 500) throw new TypeError("Invalid collection exclusions");
  const excludedIds = [...new Set(rawExclude.map(Number))];
  if (excludedIds.some(id => !Number.isSafeInteger(id) || id <= 0))
    throw new TypeError("Invalid excluded product ID");
  return { mode, match, conditions, excludedIds };
}

export function matchesCollectionRules(product, configInput) {
  const config = normalizeCollectionRules(configInput);
  if (!config.conditions.length) return false;
  const evaluate = condition => {
    const text = String(product?.[condition.field] || "").toLowerCase();
    const value = condition.value.toLowerCase();
    if (condition.operator === "equals") return text === value;
    if (condition.operator === "starts_with") return text.startsWith(value);
    return text.includes(value);
  };
  return config.match === "all"
    ? config.conditions.every(evaluate) : config.conditions.some(evaluate);
}
export function resolveCollectionMembers(products, manualIds, configInput = {}) {
  const config = normalizeCollectionRules(configInput);
  const rows = [...(products || [])];
  const known = new Set(rows.map(p => Number(p.id)));
  const manual = [...new Set((manualIds || []).map(Number))].filter(id => known.has(id));
  const automatic = config.mode === "manual" ? [] : rows
    .filter(p => matchesCollectionRules(p, config))
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")))
    .map(p => Number(p.id));
  const ids = config.mode === "automatic" ? automatic
    : config.mode === "hybrid" ? [...manual, ...automatic] : manual;
  const blocked = new Set(config.excludedIds);
  return [...new Set(ids)].filter(id => !blocked.has(id));
}
