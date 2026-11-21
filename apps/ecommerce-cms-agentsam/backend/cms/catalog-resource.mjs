/**
 * Catalog template → installed CMS instance helpers.
 * Definitions come from the packaged embed catalog; installed instances are
 * normal cms_page_sections + cms_section_blocks rows — not a parallel registry.
 */
// Compile the exact packaged catalog into both the Worker and Node builds.
// A Cloudflare Worker has no local filesystem and cannot fileURLToPath()
// an import.meta.url issued by its bundled runtime.
import packagedEmbedCatalog from "../../frontend/static/theme-editor/embed-catalog.json" with { type: "json" };

const TEMPLATE_KEY = "storefront_embed";
const BLOCK_ID = "embed-root";
const KEY = /^[a-z][a-z0-9_]{0,63}$/;

let cachedCatalog = null;

export function loadEmbedCatalog() {
  if (cachedCatalog) return cachedCatalog;
  const raw = structuredClone(packagedEmbedCatalog);
  if (raw?.schema !== "agentsam.theme-embed-ui-catalog.v1" || !Array.isArray(raw.apps)) {
    throw new Error("cms_catalog_invalid");
  }
  cachedCatalog = raw;
  return raw;
}

export function resolveCatalogTemplate(catalogKey) {
  const key = String(catalogKey || "").trim();
  if (!KEY.test(key)) return null;
  const entry = loadEmbedCatalog().apps.find((app) => app.key === key);
  if (!entry?.default_config || typeof entry.default_config !== "object") return null;
  const surfaces = Array.isArray(entry.surfaces) ? entry.surfaces : [];
  // Packaged embeds declare storefront_embed and/or cms_block. Either surface
  // is enough to install a page-owned CMS instance from the catalog.
  if (!surfaces.includes("cms_block") && !surfaces.includes("storefront_embed")) return null;
  return entry;
}

export function isCatalogInstalledContent(content) {
  return Boolean(
    content &&
      typeof content === "object" &&
      !Array.isArray(content) &&
      content.__editor?.templateKey === TEMPLATE_KEY &&
      typeof content.__editor?.catalogKey === "string",
  );
}

/**
 * Build instance content from a catalog template.
 * Top-level settings are merchant-editable; __editor.blocks projects into
 * cms_section_blocks with a stable per-section block identity.
 */
export function buildCatalogInstanceContent(template, settings = {}) {
  const defaults = structuredClone(template.default_config || {});
  const overrides =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? structuredClone(settings)
      : {};
  const merged = { ...defaults, ...overrides, enabled: overrides.enabled !== false };
  const blockSettings = structuredClone(merged);
  return {
    ...merged,
    [BLOCK_ID]: blockSettings,
    __editor: {
      templateKey: TEMPLATE_KEY,
      catalogKey: template.key,
      definitionKey: template.key,
      catalogLabel: template.name,
      source: "catalog-install",
      visibility: { enabled: merged.enabled !== false },
      blocks: [{ id: BLOCK_ID, templateKey: template.key, enabled: merged.enabled !== false }],
    },
  };
}

export function sectionKeyBase(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "section";
}

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const COLOR = /^(#[0-9a-f]{3,8}|var\(--[a-z0-9-]{1,48}\)|[a-z]{3,24}|(rgb|hsl)a?\([0-9\s.,%]{3,40}\))$/i;
const IMAGE = /^(\/(?!\/)[A-Za-z0-9._~\-\/%]{1,300}|https:\/\/[^\s"'<>]{1,500})$/;
const PRODUCT_ID = /^[A-Za-z0-9_-]{1,64}$/;

function checkField(spec, value) {
  const options = Array.isArray(spec.options) ? spec.options : [];
  switch (spec.type) {
    case "text":
    case "textarea": {
      const max = spec.type === "textarea" ? 2000 : 500;
      if (typeof value !== "string" || value.length > max) return { error: `must be text up to ${max} characters` };
      return { value };
    }
    case "color":
      return value === "" || (typeof value === "string" && COLOR.test(value)) ? { value } : { error: "must be a color" };
    case "toggle":
      return typeof value === "boolean" ? { value } : { error: "must be on or off" };
    case "radio":
    case "select":
      return options.includes(value) ? { value } : { error: "must be one of the listed options" };
    case "multiselect":
      return Array.isArray(value) && value.every((item) => options.includes(item))
        ? { value: [...new Set(value)] } : { error: "must be listed options" };
    case "range":
    case "number": {
      const n = Number(value);
      if (!Number.isFinite(n)) return { error: "must be a number" };
      const min = Number.isFinite(Number(spec.min)) ? Number(spec.min) : 0;
      const max = Number.isFinite(Number(spec.max)) ? Number(spec.max) : 600000;
      return { value: Math.min(max, Math.max(min, Math.round(n))) };
    }
    case "image":
      return value === "" || (typeof value === "string" && IMAGE.test(value)) ? { value } : { error: "must be a /media path or https link" };
    case "product_picker":
      return Array.isArray(value) && value.length <= 4 && value.every((id) => PRODUCT_ID.test(String(id)))
        ? { value: value.map(String) } : { error: "must be up to 4 product ids" };
    default:
      return null; // unknown type: not merchant-editable
  }
}

/**
 * The manifest is the only authority on what a site owner may change.
 * Templates that declare editor_fields are locked: every key not declared
 * (or declared owner_only) is forced to the template default, and declared
 * values are validated by field type. Templates without editor_fields keep
 * their existing free-form behaviour.
 */
export function enforceCatalogSettings(template, input) {
  const fields = Array.isArray(template?.editor_fields) ? template.editor_fields : null;
  if (!fields) return { ok: true, governed: false, settings: isObject(input) ? input : {} };
  const source = isObject(input) ? input : {};
  const settings = structuredClone(template.default_config || {});
  if ("enabled" in source) settings.enabled = source.enabled !== false;
  const errors = [];
  for (const spec of fields) {
    if (spec.owner_only || !(spec.key in source)) continue;
    const checked = checkField(spec, source[spec.key]);
    if (!checked) continue;
    if (checked.error) errors.push(`${spec.label || spec.key} ${checked.error}`);
    else settings[spec.key] = checked.value;
  }
  return errors.length ? { ok: false, governed: true, errors } : { ok: true, governed: true, settings };
}

/** Section keys minted by install are `<sectionKeyBase(catalogKey)>-<8 chars>`; the key, not the body, names the template. */
export function templateForSectionKey(sectionKey) {
  const key = String(sectionKey || "");
  return loadEmbedCatalog().apps.find((app) => new RegExp(`^${sectionKeyBase(app.key)}-[0-9a-f]{8}$`).test(key)) || null;
}

/** Guard an incoming section body. Returns { content } or { error, status }. */
export function guardCatalogContent(sectionKey, content) {
  const template = templateForSectionKey(sectionKey);
  const claimed = content?.__editor?.catalogKey;
  if (!template) {
    return isCatalogInstalledContent(content) && resolveCatalogTemplate(claimed)
      ? { error: "Section is not bound to this template", status: 422 } : { content };
  }
  if (claimed !== undefined && claimed !== template.key) return { error: "Section is not bound to this template", status: 422 };
  const { ok, governed, settings, errors } = enforceCatalogSettings(
    template, Object.fromEntries(Object.entries(content).filter(([k]) => k !== "__editor" && k !== BLOCK_ID)));
  if (!ok) return { error: errors.join("; "), status: 422 };
  if (!governed) return { content };
  return { content: {
    ...settings,
    [BLOCK_ID]: structuredClone(settings),
    __editor: { ...(isObject(content.__editor) ? content.__editor : {}),
      templateKey: TEMPLATE_KEY, catalogKey: template.key, definitionKey: template.key },
  } };
}

/** Install-time settings: validated against the manifest, 422 on invalid editable values. */
export function catalogInstallSettings(template, settings) {
  const checked = enforceCatalogSettings(template, settings);
  return checked.ok ? { settings: checked.settings } : { error: checked.errors.join("; "), status: 422 };
}

export function catalogTemplateKey() {
  return TEMPLATE_KEY;
}

export function catalogBlockId() {
  return BLOCK_ID;
}
