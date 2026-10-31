/**
 * Account-scoped D1 definition discovery for the existing FNF Theme Studio.
 * Definitions describe settings and semantics; the source/portable storefront
 * renderer remains the implementation authority until an artifact is verified.
 */
import { normalizeSettingContract, overlayRenderableBlockFields } from "./setting-contract.ts";
import { installedDefinition } from "./composition-contract.ts";
const KEY = /^[a-z][a-z0-9-]{0,63}$/;
const KIND = new Set(["section", "block"]);
const STATUS = new Set(["active", "draft", "deprecated", "archived"]);

function parseJson(value, fallback) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeCmsDefinition(row) {
  // Preserve the versioned settings from D1. Fill presentation labels only;
  // source types and keys remain untouched for the typed inspector contracts.
  const raw = parseJson(row.settings_schema_json, {});
  const fields = Object.fromEntries(Object.entries(raw).map(([key, spec]) => [
    key, spec && typeof spec === 'object' && !Array.isArray(spec)
      ? { ...spec, label: spec.label || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]/g, ' ') }
      : spec,
  ]));
  const metadata = parseJson(row.metadata_json, {});
  const allowedBlocks = parseJson(row.allowed_blocks_json, []);
  const normalizedBlocks = Array.isArray(allowedBlocks)
    ? allowedBlocks.filter(item => typeof item === "string" && KEY.test(item))
    : [];
  // Preserve PR #150: installed composition contracts are derived from D1,
  // with explicit diagnostics rather than a parallel preset authority.
  let composition = null;
  let compositionError = null;
  try {
    composition = installedDefinition({
      definition_key: row.definition_key, kind: row.kind,
      origin: row.origin, version: row.version, status: row.status,
      metadata, allowedBlocks: normalizedBlocks, maxBlocks: row.max_blocks,
    });
  } catch (error) {
    compositionError = String(error?.message || error);
  }
  return {
    id: row.id,
    key: row.definition_key,
    kind: row.kind,
    version: row.version,
    label: row.label,
    description: row.description || "",
    category: row.category || "General",
    origin: row.origin,
    status: row.status,
    fields,
    allowedBlocks: normalizedBlocks,
    maxBlocks: row.max_blocks == null ? null : Number(row.max_blocks),
    metadata,
    composition,
    ...(compositionError ? {compositionError} : {}),
    artifact: row.artifact_id && row.artifact_status === "ready"
      ? { id: row.artifact_id, type: row.artifact_type, version: row.artifact_version,
          manifestObjectKey: row.manifest_object_key, contentHash: row.content_hash }
      : null,
  };
}

export async function listCmsDefinitions(env, accountId, filters = {}) {
  if (typeof accountId !== "string" || !accountId.trim()) {
    throw new Error("cms_definition_account_required");
  }
  if (filters.kind && !KIND.has(filters.kind)) throw new Error("invalid_definition_kind");
  if (filters.status && !STATUS.has(filters.status)) throw new Error("invalid_definition_status");
  if (filters.key && !KEY.test(filters.key)) throw new Error("invalid_definition_key");
  if (filters.version && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,47}$/.test(filters.version)) {
    throw new Error("invalid_definition_version");
  }
  let query = `SELECT d.id, d.definition_key, d.kind, d.label, d.description,
    d.category, d.origin, d.version, d.status, d.artifact_id,
    d.settings_schema_json, d.allowed_blocks_json, d.max_blocks, d.metadata_json,
    a.status AS artifact_status, a.artifact_type, a.version AS artifact_version,
    a.manifest_object_key, a.content_hash
    FROM cms_definitions d
    LEFT JOIN cms_artifacts a ON a.id = d.artifact_id AND a.account_id = d.account_id
    WHERE d.account_id = ?`;
  const binds = [accountId];
  for (const [param, column] of [["kind", "d.kind"], ["status", "d.status"], ["key", "d.definition_key"], ["version", "d.version"]]) {
    if (filters[param]) {
      query += ` AND ${column} = ?`;
      binds.push(filters[param]);
    }
  }
  query += " ORDER BY d.kind, d.definition_key, d.version DESC LIMIT 300";
  const result = await env.DB.prepare(query).bind(...binds).all();
  return (result.results || []).map(normalizeCmsDefinition);
}

/**
 * Bridge an ACTIVE semantic definition to an ALREADY RENDERABLE host section.
 * Never synthesize an unimplemented visual section from a database record.
 */
// Canonical definition fields take precedence over the old JS page
// descriptor when a genuine implementation has already been registered.
// This only describes the inspector; it never fabricates a renderer.
export function attachCmsDefinitions(registry, definitions) {
  const pages = structuredClone(registry.pages || {});
  const indexed = new Map();
  const blockIndexed = new Map();
  for (const definition of definitions) {
    if (definition.status !== "active") continue;
    const target = definition.kind === "section" ? indexed :
      definition.kind === "block" ? blockIndexed : null;
    if (!target) continue;
    const old = target.get(definition.key);
    if (!old || String(definition.version).localeCompare(String(old.version), undefined, { numeric: true }) > 0) {
      target.set(definition.key, definition);
    }
  }
  for (const page of Object.values(pages)) {
    // Generated definitions are installable only when a validated, ready R2
    // implementation exists. They share the same typed inspector contract.
    // The editor's native catalog remains restricted to known insertable
    // templates; a generated definition is installed via explicit acceptance.
    for (const definition of indexed.values()) {
      if (definition.origin !== "generated" || !definition.artifact || page.sections?.[definition.key]) continue;
      const normalized = normalizeSettingContract(definition.fields);
      const fields = normalized.fields;
      if (!fields.length) continue;
      page.sections[definition.key] = {
        sortOrder: 1000,
        label: definition.label,
        icon: "section",
        capabilities: { edit:true,media:true,settings:true,reorder:true,duplicate:true,remove:true,blocks:false },
        fields, blocks:[],settings:[],guardrails:{ allowRawCss:false,allowRawHtml:false },
        definitionKey:definition.key, definitionVersion:definition.version,
        definitionOrigin:"generated", definitionId:definition.id,
        ...(normalized.issues.length ? { schemaConflicts: normalized.issues.map(issue => ({
          ...issue, definitionId:definition.id,
        })) } : {}),
      };
    }
    for (const [key, section] of Object.entries(page.sections || {})) {
      const definition = indexed.get(key);
      if (!definition) continue;
      // Existing source/renderer and typed inspector remain the implementation.
      section.definitionKey = definition.key;
      section.definitionVersion = definition.version;
      section.definitionOrigin = definition.origin;
      section.definitionStatus = definition.status;
      section.definitionId = definition.id;
      if (definition.composition?.presets?.length) {
        section.installedPresets = definition.composition.presets;
      }
      if (definition.compositionError) {
        (section.schemaConflicts ||= []).push({
          kind: "invalid-installed-composition", definitionId: definition.id,
          error: definition.compositionError,
        });
      }
      // The legacy registry supplies an implementation compatibility
      // fallback. Active D1 definitions supply the authoritative inspector
      // schema whenever they declare actual settings. Empty definitions
      // intentionally leave existing controls intact.
      const normalized = normalizeSettingContract(definition.fields);
      const fields = normalized.fields;
      for (const issue of normalized.issues) {
        (section.schemaConflicts ||= []).push({...issue, definitionId:definition.id});
      }
      // A source-backed section with no native section fields and real
      // children is block-only. Imported/legacy D1 rows must not turn its
      // nested card properties into unbound section-level controls.
      const nativeBlocks = Array.isArray(section.blocks) ? section.blocks : [];
      const sourceBlockOnly = Array.isArray(section.fields) &&
        section.fields.length === 0 && nativeBlocks.length > 0;
      if (fields.length && definition.origin !== "generated") {
        if (sourceBlockOnly) {
          (section.schemaConflicts ||= []).push({
            kind: "unbound-section-fields",
            definitionId: definition.id,
            fieldKeys: fields.map((field) => field.key),
          });
        } else {
          section.fields = fields;
          section.schemaAuthority = "cms_definitions";
        }
      }
      if (definition.allowedBlocks?.length && nativeBlocks.length) {
        const allowed = new Set(definition.allowedBlocks);
        const renderable = nativeBlocks.filter((block) => allowed.has(block.key));
        if (renderable.length) {
          section.blocks = renderable;
        } else {
          // A stale "group"-only definition must not erase native, editable
          // card templates. Keep the renderer-bound children untouched and
          // expose exact disagreement for the definition repair sprint.
          (section.schemaConflicts ||= []).push({
            kind: "unsupported-block-types",
            definitionId: definition.id,
            declared: definition.allowedBlocks,
            renderable: nativeBlocks.map((block) => block.key),
          });
        }
      }
      if (definition.maxBlocks != null) {
        section.guardrails = { ...(section.guardrails || {}), maxBlocks: definition.maxBlocks };
      }
    }
    // A block definition may enhance an existing renderer/editor schema,
    // but may not register a fictional block or invent a missing binding.
    for (const section of Object.values(page.sections || {})) {
      if (!Array.isArray(section.blocks) || !section.blocks.length) continue;
      section.blocks = section.blocks.map(block => {
        const blockDefinition = blockIndexed.get(block.key);
        if (!blockDefinition) return block;
        const projected = overlayRenderableBlockFields(block, blockDefinition);
        for (const conflict of projected.conflicts) {
          (section.schemaConflicts ||= []).push({
            ...conflict, blockKey:block.key, definitionId:blockDefinition.id,
          });
        }
        return projected.block;
      });
    }
  }
  const known = new Set(Object.values(pages).flatMap((page) => Object.keys(page.sections || {})));
  return {
    ...registry,
    pages,
    definitions: definitions.map((definition) => ({
      ...definition,
      insertable: definition.status === "active" && definition.kind === "section" && known.has(definition.key),
    })),
  };
}
