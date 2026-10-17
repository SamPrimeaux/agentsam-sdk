/**
 * One product system: distribute software today, manufacture physical goods tomorrow.
 * No new tables. Product identity stays in the existing authority:
 *   software  -> agentsam_products   (kind, status, tags, metadata)
 *   other     -> reconciled through the CMS product contract (never copied into agentsam_products)
 * Collections: cms_collections (identity + smart rule). Media: cms_assets.
 *
 * Three ideas kept apart:
 *   type (kind)  -> what the product IS            (fixed fields)
 *   collection   -> a named, ordered view of items (slug, SKU, SEO, rule)
 *   tag          -> an attribute used by rules and facets
 * Registered is NOT published, purchasable, installable or manufacturing-ready.
 */

/* ---------- capabilities: one id per surface + interaction, each verified separately ---------- */

/** Where a person (or agent) touches a product. Product Studio tabs are ONE surface family, not separate screens. */
export type Surface =
  | "studio"       // Product Studio editor tabs (merchant)
  | "collection"   // collection editor / smart-rule preview (merchant)
  | "storefront"   // public listing + cart (customer)
  | "checkout"     // payment (customer)
  | "install"      // distribution / licensing / updates (customer + merchant)
  | "template"     // preview + apply to a site (merchant)
  | "automation"   // run / schedule (merchant, agent)
  | "fulfillment"; // manufacturer order + tracking (system, merchant)

export type Interaction = "view" | "edit" | "generate" | "publish" | "add" | "purchase" | "run" | "grant" | "apply" | "submit";
export type Actor = "merchant" | "customer" | "agent" | "system";
/** supported = kind + adapter allow it (editor surfaces). verified = a check passed (anything a customer touches). */
export type Gate = "supported" | "verified";

/** Single source of truth. The CapabilityId union is derived from these keys; add a capability here and nowhere else. */
export const CAPABILITIES = {
  // ---- studio: merchant editor tabs
  "studio.overview.edit":     { surface: "studio",     interaction: "edit",     actors: ["merchant", "agent"], gate: "supported", kinds: "*" },
  "studio.media.edit":        { surface: "studio",     interaction: "edit",     actors: ["merchant", "agent"], gate: "supported", kinds: "*" },
  "studio.pricing.edit":      { surface: "studio",     interaction: "edit",     actors: ["merchant"],          gate: "supported", kinds: ["app", "theme", "physical"] },
  "studio.tags.edit":         { surface: "studio",     interaction: "edit",     actors: ["merchant", "agent"], gate: "supported", kinds: "*" },
  "studio.release.manage":    { surface: "studio",     interaction: "edit",     actors: ["merchant"],          gate: "supported", kinds: ["app", "sdk-package", "integration", "theme", "section", "block"] },
  "studio.variants.edit":     { surface: "studio",     interaction: "edit",     actors: ["merchant"],          gate: "supported", kinds: ["physical"], adapter: "variants" },
  "studio.print_locations.edit": { surface: "studio",  interaction: "edit",     actors: ["merchant"],          gate: "supported", kinds: ["physical"], adapter: "printLocations" },
  "studio.mockups.generate":  { surface: "studio",     interaction: "generate", actors: ["merchant", "agent"], gate: "supported", kinds: ["physical"], adapter: "mockups" },
  "studio.specs.view":        { surface: "studio",     interaction: "view",     actors: ["merchant"],          gate: "supported", kinds: ["physical"], adapter: "specifications" },
  "studio.inventory.view":    { surface: "studio",     interaction: "view",     actors: ["merchant"],          gate: "supported", kinds: ["physical"], adapter: "inventory" },
  // ---- collection
  "collection.rule.edit":       { surface: "collection", interaction: "edit",    actors: ["merchant", "agent"], gate: "supported", kinds: "*" },
  "collection.membership.view": { surface: "collection", interaction: "view",    actors: ["merchant", "agent"], gate: "supported", kinds: "*" },
  "collection.publish":         { surface: "collection", interaction: "publish", actors: ["merchant"],          gate: "supported", kinds: "*" },
  // ---- storefront (customer-facing => verified)
  "storefront.listing.publish": { surface: "storefront", interaction: "publish", actors: ["merchant"],          gate: "verified",  kinds: ["app", "sdk-package", "integration", "theme", "physical"] },
  "storefront.cart.add":        { surface: "storefront", interaction: "add",     actors: ["customer"],          gate: "verified",  kinds: ["app", "theme", "physical"], requires: ["storefront.listing.publish", "checkout.purchase"] },
  // ---- checkout
  "checkout.purchase":          { surface: "checkout",   interaction: "purchase", actors: ["customer"],         gate: "verified",  kinds: ["app", "theme", "physical"] },
  // ---- install / distribution
  "install.package.run":        { surface: "install",    interaction: "run",     actors: ["customer", "agent"], gate: "verified",  kinds: ["app", "sdk-package", "integration"] },
  "install.license.grant":      { surface: "install",    interaction: "grant",   actors: ["system"],            gate: "verified",  kinds: ["app", "theme"], requires: ["checkout.purchase"] },
  "install.update.apply":       { surface: "install",    interaction: "apply",   actors: ["customer", "agent"], gate: "verified",  kinds: ["app", "sdk-package", "integration"], requires: ["install.package.run"] },
  // ---- template
  "template.preview.view":      { surface: "template",   interaction: "view",    actors: ["merchant", "customer"], gate: "verified", kinds: ["theme", "section", "block"] },
  "template.site.apply":        { surface: "template",   interaction: "apply",   actors: ["merchant", "agent"], gate: "verified",  kinds: ["theme", "section", "block"] },
  // ---- automation (existing automation-tagged products; no new D1 kind required)
  "automation.run.start":       { surface: "automation", interaction: "run",     actors: ["merchant", "agent"], gate: "verified",  kinds: "*" },
  // ---- fulfillment (manufacturer)
  "fulfillment.order.submit":   { surface: "fulfillment", interaction: "submit", actors: ["system"],            gate: "verified",  kinds: ["physical"], adapter: "fulfillment", requires: ["checkout.purchase"] },
  "fulfillment.status.view":    { surface: "fulfillment", interaction: "view",   actors: ["merchant", "customer"], gate: "verified", kinds: ["physical"], adapter: "fulfillment" },
} as const satisfies Record<string, CapabilitySpec>;

export type CapabilityId = keyof typeof CAPABILITIES;

export interface CapabilitySpec {
  surface: Surface;
  interaction: Interaction;
  actors: readonly Actor[];
  gate: Gate;
  kinds: "*" | readonly string[];
  adapter?: keyof ManufacturingProviderAdapter;   // capability exists only if the provider implements this
  requires?: readonly string[];                    // other capabilities that must be ENABLED first
}

/** Ids written by the first draft. Old metadata.capability_states rows keep working; rewrite on next save. */
export const LEGACY_CAPABILITY_ALIASES: Record<string, CapabilityId> = {
  "storefront.publish": "storefront.listing.publish",
  "commerce.purchase": "checkout.purchase",
  "distribution.install": "install.package.run",
  "template.apply": "template.site.apply",
  "automation.run": "automation.run.start",
  "mfg.variants": "studio.variants.edit",
  "mfg.print_locations": "studio.print_locations.edit",
  "mfg.mockups": "studio.mockups.generate",
  "mfg.specs": "studio.specs.view",
  "mfg.inventory": "studio.inventory.view",
  "mfg.fulfillment": "fulfillment.order.submit",
};

export type VerificationState = "unverified" | "verified" | "failed" | "revoked";

/** Stored at agentsam_products.metadata.capability_states (and the CMS product record for other providers). */
export interface CapabilityState {
  capability: CapabilityId | keyof typeof LEGACY_CAPABILITY_ALIASES;
  state: VerificationState;
  verifiedAt?: number;          // unix seconds
  verifier?: string;            // job, CLI command or person that checked it
  evidence?: string;            // receipt id, release tag, URL, manifest hash
}

/* ---------- what each kind is allowed to offer (derived: support, not proof) ---------- */

const ALL_IDS = Object.keys(CAPABILITIES) as CapabilityId[];
const spec = (id: CapabilityId): CapabilitySpec => CAPABILITIES[id];
const kindAllows = (id: CapabilityId, kind: string) => { const k = spec(id).kinds; return k === "*" || k.includes(kind); };

export const capabilitiesForKind = (kind: string): CapabilityId[] => ALL_IDS.filter(id => kindAllows(id, kind));

/* ---------- manufacturing providers plug in here; a capability appears only if implemented ---------- */

export interface ManufacturingProviderAdapter {
  id: string;                                            // registry id, never hardcoded in the editor
  catalog(): Promise<ProviderCatalogItem[]>;             // approved products only
  variants?(sku: string): Promise<unknown[]>;
  printLocations?(sku: string): Promise<unknown[]>;
  mockups?(input: { sku: string; assetId: string }): Promise<{ assetId: string }[]>; // results land in cms_assets
  specifications?(sku: string): Promise<Record<string, unknown>>;
  inventory?(sku: string): Promise<unknown>;
  fulfillment?(orderRef: string): Promise<unknown>;
}
export interface ProviderCatalogItem { providerSku: string; name: string; approved: boolean }

/* ---------- what each surface shows ---------- */

export interface ProductLike {
  kind: string;
  tags?: readonly string[] | string | null;
  metadata?: { capability_states?: CapabilityState[] } | null;
}

export interface ResolvedCapability {
  capability: CapabilityId;
  surface: Surface;
  supported: boolean;       // kind allows it AND provider implements the adapter method
  state: VerificationState;
  enabled: boolean;         // gate met AND every `requires` capability is enabled
  reason?: "kind" | "adapter" | "unverified" | "blocked_by" | "actor";
  blockedBy?: string[];
}

function stateMap(p: ProductLike): Map<CapabilityId, VerificationState> {
  const m = new Map<CapabilityId, VerificationState>();
  for (const s of p.metadata?.capability_states ?? []) {
    const id = (LEGACY_CAPABILITY_ALIASES[s.capability] ?? s.capability) as CapabilityId;
    if (id in CAPABILITIES) m.set(id, s.state);
  }
  return m;
}

/** Resolve every capability for a product. Pass `surface`/`actor` to get exactly what that screen or person may do. */
export function resolveCapabilities(
  p: ProductLike,
  opts: { provider?: ManufacturingProviderAdapter; surface?: Surface; actor?: Actor } = {},
): ResolvedCapability[] {
  const states = stateMap(p);
  const base = new Map<CapabilityId, ResolvedCapability>();
  for (const id of ALL_IDS) {
    const c = spec(id);
    let supported = kindAllows(id, p.kind);
    // Automation is a facet of an existing product kind, not a new products table kind.
    if (id === "automation.run.start") {
      const tags = Array.isArray(p.tags) ? p.tags : (typeof p.tags === "string" ? (() => { try { const v = JSON.parse(p.tags); return Array.isArray(v) ? v : p.tags.split(","); } catch { return p.tags.split(","); } })() : []);
      supported = tags.some(t => typeof t === "string" && t.trim().toLowerCase() === "automation");
    }
    let reason: ResolvedCapability["reason"];
    if (!supported) reason = "kind";
    else if (c.adapter && typeof opts.provider?.[c.adapter] !== "function") { supported = false; reason = "adapter"; }
    const state = supported ? states.get(id) ?? "unverified" : "unverified";
    const gateMet = supported && (c.gate === "supported" || state === "verified");
    base.set(id, { capability: id, surface: c.surface, supported, state, enabled: gateMet, reason: gateMet ? undefined : reason ?? "unverified" });
  }
  // dependencies: a capability is enabled only if everything it requires is enabled (single pass is enough: graph is shallow, checked below)
  for (const id of ALL_IDS) {
    const r = base.get(id)!;
    const needs = (spec(id).requires ?? []) as CapabilityId[];
    const blocked = needs.filter(n => !base.get(n)?.enabled);
    if (r.enabled && blocked.length) { r.enabled = false; r.reason = "blocked_by"; r.blockedBy = blocked; }
  }
  let out = [...base.values()].filter(r => r.supported || r.reason === "adapter");
  if (opts.surface) out = out.filter(r => r.surface === opts.surface);
  if (opts.actor) out = out.filter(r => spec(r.capability).actors.includes(opts.actor!));
  return out;
}

export const isEnabled = (r: ResolvedCapability) => r.enabled;

/** Surface -> ids, for building nav/tabs without hardcoding per screen. */
export const SURFACE_CAPABILITIES: Record<Surface, CapabilityId[]> =
  Object.fromEntries((["studio","collection","storefront","checkout","install","template","automation","fulfillment"] as Surface[])
    .map(s => [s, ALL_IDS.filter(id => spec(id).surface === s)])) as Record<Surface, CapabilityId[]>;

/** Guard for server routes: one call per user interaction. */
export function canDo(p: ProductLike, id: CapabilityId, actor: Actor, provider?: ManufacturingProviderAdapter): ResolvedCapability & { allowed: boolean } {
  const r = resolveCapabilities(p, { provider }).find(x => x.capability === id);
  if (!r) return { capability: id, surface: spec(id).surface, supported: false, state: "unverified", enabled: false, reason: "kind", allowed: false };
  const actorOk = spec(id).actors.includes(actor);
  return { ...r, allowed: r.enabled && actorOk, reason: actorOk ? r.reason : "actor" };
}

/* ---------- smart collection rules: validated, allowlisted, parameterized ---------- */

export interface SmartCollectionRule {
  operator: "and" | "or";
  conditions: Array<{ field: string; comparison: "eq" | "in" | "contains"; value: string | string[] }>;
}

/** field -> SQL expression, per item type. Anything not listed is rejected, never interpolated. */
export const RULE_FIELDS: Record<string, Record<string, { sql: string; allow: Array<"eq" | "in" | "contains"> }>> = {
  product: {
    kind:   { sql: "kind", allow: ["eq", "in"] },
    status: { sql: "status", allow: ["eq", "in"] },
    tags:   { sql: "EXISTS (SELECT 1 FROM json_each(agentsam_products.tags) t WHERE t.value = ?)", allow: ["contains"] },
  },
};

export function compileRule(itemType: string, rule: SmartCollectionRule): { where: string; params: string[] } {
  const fields = RULE_FIELDS[itemType];
  if (!fields) throw new Error(`No rule fields allowlisted for item type "${itemType}"`);
  if (!rule.conditions.length) throw new Error("Smart collection needs at least one condition");
  const parts: string[] = [], params: string[] = [];
  for (const c of rule.conditions) {
    const f = fields[c.field];
    if (!f) throw new Error(`Field "${c.field}" is not allowed for ${itemType}`);
    if (!f.allow.includes(c.comparison)) throw new Error(`"${c.comparison}" is not allowed on ${c.field}`);
    if (c.comparison === "eq") { parts.push(`${f.sql} = ?`); params.push(String(c.value)); }
    else if (c.comparison === "in") {
      const vals = Array.isArray(c.value) ? c.value : [c.value];
      parts.push(`${f.sql} IN (${vals.map(() => "?").join(",")})`); params.push(...vals);
    } else { parts.push(f.sql); params.push(String(c.value)); }   // contains -> tag EXISTS
  }
  return { where: parts.join(rule.operator === "and" ? " AND " : " OR "), params };
}
