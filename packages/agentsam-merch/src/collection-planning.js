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
    id: "accessories", label: "Everyday carry", caption: "Wallet + flask + keychain",
    slots: Object.freeze(["wallet", "flask", "keychain"]),
  }),
  Object.freeze({
    id: "drinkware", label: "Drinkware collection", caption: "Tumbler + mug + glass",
    slots: Object.freeze(["drinkware", "coffee-mug", "glass"]),
  }),
  Object.freeze({
    id: "desk", label: "Desk & gifts", caption: "Journal + cutting board + acrylic desk",
    slots: Object.freeze(["journal", "cutting-board", "acrylic-desk"]),
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
  "wallet": "Metal Wallet",
  "flask": "Flask",
  "keychain": "Keychain",
  "coffee-mug": "Coffee Mug",
  "glass": "Glass",
  "journal": "Leather Journal",
  "cutting-board": "Cutting Board",
  "acrylic-desk": "Acrylic Desk",
});

export function assortmentSearchTerms(recipe) {
  const found = MERCH_ASSORTMENT_RECIPES.find(item => item.id === recipe);
  if (!found) throw new TypeError("Unknown assortment recipe");
  return [...new Set(found.slots.map(slot => SLOT_TERMS[slot]).filter(Boolean))];
}
/**
 * Resolve a reusable assortment recipe against *actual supplier catalog responses*.
 * Search alone is not authority: unlisted, hidden, unavailable, or variantless
 * products cannot be automatically planned. The host fetches and passes its catalog.
 * Missing slots remain visible instead of being filled with made-up merchandise.
 */
export function resolveAssortmentCandidates(recipeId, resultsBySlot = {}) {
  const recipe = MERCH_ASSORTMENT_RECIPES.find(item => item.id === recipeId);
  if (!recipe) throw new TypeError("Unknown assortment recipe");
  const seen = new Set();
  const slots = recipe.slots.map(slot => {
    const rows = Array.isArray(resultsBySlot[slot]) ? resultsBySlot[slot] : [];
    const candidates = rows.filter(item => {
      const id = String(item?.catalog_product_id || item?.completeful_product_id || item?.id || "");
      return id && item?.available !== false && item?.available !== 0 &&
        Number(item?.variant_count ?? 0) > 0 && Number(item?.print_location_count ?? 1) > 0;
    }).sort((a,b) => Number(b?.mockup_count || 0) - Number(a?.mockup_count || 0));
    const recommended = candidates.find(item => !seen.has(String(item.catalog_product_id || item.completeful_product_id || item.id))) || null;
    if (recommended) seen.add(String(recommended.catalog_product_id || recommended.completeful_product_id || recommended.id));
    return { slot, search: SLOT_TERMS[slot] || slot, candidates, recommended };
  });
  return { recipe_id: recipeId, slots,
    recommended_ids: slots.filter(x => x.recommended).map(x => String(x.recommended.catalog_product_id || x.recommended.completeful_product_id || x.recommended.id)),
    missing_slots: slots.filter(x => !x.recommended).map(x => x.slot) };
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
