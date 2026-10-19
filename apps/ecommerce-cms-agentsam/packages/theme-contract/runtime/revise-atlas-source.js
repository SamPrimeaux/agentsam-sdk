/**
 * Adapter for the REAL Revise section-library implementations. No copied
 * section markup, CMS-specific brand fixtures or duplicated styling.
 *
 * The distinct revise-atlas namespace protects existing revise/* CMS v1
 * documents from silent content-contract upgrades.
 */
import { renderPage, presetLibraryFrom } from "@inneranimalmedia/section-library";
import { reviseShowcaseHome, reviseShowcasePresets, enhanceRevise } from "@inneranimalmedia/revise-theme";

const prefix = "revise-atlas/";
const library = presetLibraryFrom(reviseShowcasePresets);
const showcase = new Map(reviseShowcaseHome.sections.map((section) => [section.preset, section]));
const sources = new Set(reviseShowcasePresets.map((preset) => preset.id));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clone = (v) => structuredClone(v);
const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const title = (v) => String(v).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_.]+/g, " ")
  .replace(/\b[a-z]/g, (s) => s.toUpperCase());
const safeUrl = (v, media = false) => typeof v === "string" && v.length < 2048 &&
  !/[\u0000-\u001f\u007f]/.test(v) && !v.startsWith("//") &&
  (v.startsWith("/") || v.startsWith("#") || /^https?:\/\//i.test(v) ||
    (!media && /^(mailto:|tel:)/i.test(v)));
const isMedia = (k) => /(^|\.)(mediaKey|posterKey|beforeKey|afterKey|imageUrl|videoUrl|backgroundImage|[a-z]+MediaKey|[a-z]+ImageUrl)$/i.test(k);
const isLink = (k) => /(^|\.)(href|link|url|[a-z]+Href)$/i.test(k);

function fieldsOf(obj, prefix = "", depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 5) return [];
  return Object.entries(obj).flatMap(([key, v]) => {
    if (!/^[a-z][a-z0-9_]*$/i.test(key) || key === "__editor" || v == null) return [];
    const field = prefix ? prefix + "." + key : key;
    if (v && !Array.isArray(v) && typeof v === "object") return fieldsOf(v, field, depth + 1);
    const type = Array.isArray(v) ? "json" : typeof v === "boolean" ? "boolean" :
      typeof v === "number" ? "number" : isMedia(field) ? "media" :
        isLink(field) ? "link" : /(body|description|caption|subtitle|intro|sourceNote)$/i.test(field)
          ? "textarea" : "text";
    return [{ key: field, label: title(field), type }];
  });
}

function fromData(preset, input, blocks = null, lookup = {}) {
  const content = clone(input || {});
  const items = blocks?.length ? blocks.map((b) => clone(b.data || {})) :
    Array.isArray(content.items) ? clone(content.items) : null;
  if (items) delete content.items;
  const blockMeta = (items || []).map((item, i) => {
    const id = String(blocks?.[i]?.id || "item-" + (i + 1)).replace(/[^a-z0-9_-]/gi, "-").slice(0, 80);
    content[id] = item;
    return { id, templateKey: "item", enabled: true };
  });
  const media = {};
  function collect(v) {
    if (typeof v === "string" && own(lookup, v) && safeUrl(lookup[v], true)) media[v] = lookup[v];
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v).forEach(collect);
  }
  collect(input);
  content.__editor = { templateKey: "portable", themePreset: prefix + preset.split("/")[1],
    sourcePreset: preset, sourceContract: "revise/site-section-v1", blocks: blockMeta,
    ...(Object.keys(media).length ? { media } : {}) };
  return content;
}

const defaultsFor = (source) => {
  const section = showcase.get(source);
  return fromData(source, section?.data || {}, section?.blocks || null);
};
function sectionData(content) {
  const blocks = Array.isArray(content.__editor?.blocks) ? content.__editor.blocks : [];
  const blockIds = new Set(blocks.map((b) => b.id));
  const data = {};
  for (const [key, val] of Object.entries(content)) {
    if (key !== "__editor" && !blockIds.has(key)) data[key] = clone(val);
  }
  if (blocks.length) data.items = blocks.filter((b) => b.enabled !== false)
    .map((b) => clone(content[b.id] || {}));
  return data;
}
function sanitize(value, key = "") {
  if (typeof value === "string") {
    if (isLink(key) && !safeUrl(value)) return "#";
    if (isMedia(key) && /^(data:|javascript:|vbscript:|file:|\/\/)/i.test(value.trim())) return "";
    return value.slice(0, 16000);
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => sanitize(v, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .map(([k, v]) => [k, sanitize(v, key ? key + "." + k : k)]));
  return value;
}

// The published showcase leaves some real renderer fields blank. Include
// those authored in the multipage donor without duplicating renderer markup.
const optionalFields = Object.freeze({
  "revise/wardrobe-rail": ["eyebrow"],
  "revise/campaign-teaser": ["anchor"],
  "revise/brand-film": ["posterKey"],
  "revise/tabbed-products": ["anchor"],
  "revise/dark-promo-grid": ["anchor"],
  "revise/merch-lab": ["anchor"],
});
const definitions = Object.freeze(reviseShowcasePresets.map((preset) => {
  const sample = sectionData(defaultsFor(preset.id));
  const fields = fieldsOf(Object.fromEntries(Object.entries(sample).filter(([key]) => key !== "items")));
  for (const key of optionalFields[preset.id] || []) {
    if (!fields.some((f) => f.key === key)) {
      fields.push({ key, label: title(key), type: isMedia(key) ? "media" : "text" });
    }
  }
  const items = sample.items || [];
  const itemFields = items.length ? fieldsOf(Object.assign({}, ...items)) : [];
  return Object.freeze({
    id: prefix + preset.id.split("/")[1], label: title(preset.id.split("/")[1]),
    type: preset.type, family: preset.type, source: "revise",
    sourcePreset: preset.id, templateKey: "portable", preset: prefix + preset.id.split("/")[1],
    fields, blocks: items.length ? [{ key: "item", label: "Item", repeatable: true, min: 0,
      max: 100, fields: itemFields, defaultContent: clone(items[0]) }] : [],
  });
}));
const byId = new Map(definitions.map((d) => [d.id, d]));
function validate(id, content) {
  const def = byId.get(id);
  if (!def || !content || typeof content !== "object" || Array.isArray(content) ||
    content.__editor?.themePreset !== id || content.__editor?.templateKey !== "portable" ||
    content.__editor?.sourcePreset !== def.sourcePreset) return { ok: false, error: "Invalid Revise section contract" };
  let data;
  try {
    if (JSON.stringify(content).length > 120000) return { ok: false, error: "Section too large" };
    data = sectionData(content);
  } catch { return { ok: false, error: "Invalid section document" }; }
  const expected = new Set(Object.keys(sectionData(defaultsFor(def.sourcePreset))).concat(
    def.fields.map((field) => field.key.split(".")[0])));
  for (const key of Object.keys(data)) if (!expected.has(key)) return { ok: false, error: "Unknown field: " + key };
  const check = (v, key = "") => {
    if (typeof v === "string") return v.length <= 16000 && (!isLink(key) || safeUrl(v)) &&
      (!isMedia(key) || !/^(data:|javascript:|vbscript:|file:|\/\/)/i.test(v.trim()));
    if (Array.isArray(v)) return v.length <= 100 && v.every((item) => check(item, key));
    if (v && typeof v === "object") return Object.entries(v).every(([k, item]) =>
      /^[a-zA-Z0-9_.-]{1,90}$/.test(k) && check(item, key ? key + "." + k : k));
    return typeof v === "boolean" || typeof v === "number" || v === null;
  };
  if (!check(data) || (content.__editor.media &&
    Object.values(content.__editor.media).some((url) => !safeUrl(url, true)))) {
    return { ok: false, error: "Invalid field or unsafe URL" };
  }
  return { ok: true };
}
function render(entry) {
  const content = entry?.content;
  const def = byId.get(content?.__editor?.themePreset);
  if (!def) return null;
  const media = content.__editor?.media || {};
  const html = renderPage({
    id: String(entry.key || def.id).replace(/[^a-z0-9_-]/gi, "-"),
    type: "page-preset", theme: "revise",
    sections: [{ type: def.type, preset: def.sourcePreset, data: sanitize(sectionData(content)) }],
  }, { context: { theme: "revise", resolveMedia(key) {
    if (safeUrl(key, true)) return key;
    return safeUrl(media[key], true) ? media[key] : null;
  } }, presets: library });
  return '<section class="ps-section ps-revise-atlas" id="' + esc(entry.key || def.id) +
    '" data-cms-section="' + esc(entry.key || def.id) +
    '" data-portable-preset="' + esc(def.id) + '" data-source-renderer="' +
    esc(def.sourcePreset) + '"><div class="iam-site-section" data-surface="canvas" data-site-preset="' +
    esc(def.sourcePreset) + '">' + html + '</div></section>';
}
export const reviseAtlas = Object.freeze({
  definitions,
  get: (id) => byId.get(id) || null,
  catalog: () => definitions.map(({ id, label, type, source, templateKey, preset }) =>
    ({ id, label: "Revise · " + label, type, source, templateKey, preset })),
  schema(id) {
    const d = byId.get(id);
    return d ? { label: "Revise · " + d.label, fields: d.fields, blocks: d.blocks, settings: [],
      capabilities: { edit: true, reorder: true, duplicate: true, remove: true, blocks: !!d.blocks.length },
      guardrails: { maxBlocks: d.blocks[0]?.max || 0 } } : null;
  },
  defaults: (id) => byId.has(id) ? defaultsFor(byId.get(id).sourcePreset) : null,
  fromSiteSection: (section, media = {}) => sources.has(section?.preset) ?
    fromData(section.preset, section.data, section.blocks, media) : null,
  validate, render,
  enhance(root) { return enhanceRevise(root); },
});
