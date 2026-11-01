/**
 * Catalog template → installed CMS instance helpers.
 * Definitions come from the packaged embed catalog; installed instances are
 * normal cms_page_sections + cms_section_blocks rows — not a parallel registry.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const CATALOG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../frontend/static/theme-editor/embed-catalog.json",
);

const TEMPLATE_KEY = "storefront_embed";
const BLOCK_ID = "embed-root";
const KEY = /^[a-z][a-z0-9_]{0,63}$/;

let cachedCatalog = null;

export function loadEmbedCatalog() {
  if (cachedCatalog) return cachedCatalog;
  const raw = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
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

export function catalogTemplateKey() {
  return TEMPLATE_KEY;
}

export function catalogBlockId() {
  return BLOCK_ID;
}
