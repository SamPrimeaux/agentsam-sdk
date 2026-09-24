/**
 * Resolve `.agentsam/features.json` selections against package-local feature
 * packets (via protocol/features/catalog.json discovery). Protocol holds only
 * the generic capsule contract + catalog — not identity/provider detail trees.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = path.resolve(HERE, '../..');
const PROTOCOL_ROOT = path.join(SDK_ROOT, 'protocol');
const OAUTH_PORTAL_DIR = path.join(
  SDK_ROOT,
  'packages/identity/.agentsam/features/oauth-login-portal',
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath);
}

export function protocolRoot(options = {}) {
  return options.protocolRoot || PROTOCOL_ROOT;
}

export function oauthPortalDir(options = {}) {
  return options.oauthPortalDir || OAUTH_PORTAL_DIR;
}

/** Canonical provider template ids. Legacy `iam` normalizes to `inneranimalmedia`. */
export function normalizeProviderTemplateId(id) {
  const key = String(id || '').trim().toLowerCase();
  if (!key) return '';
  if (key === 'iam') return 'inneranimalmedia';
  return key;
}

export function loadFeatureCatalog(options = {}) {
  return safeReadJson(path.join(protocolRoot(options), 'features', 'catalog.json'));
}

/** Load a feature capsule by id via catalog discovery, or absolute/relative manifest path. */
export function loadFeatureManifest(featureId, options = {}) {
  const catalog = loadFeatureCatalog(options);
  const entry = (catalog?.features || []).find((row) => row.id === featureId);
  if (!entry?.manifest) return null;
  const manifestPath = path.isAbsolute(entry.manifest)
    ? entry.manifest
    : path.join(SDK_ROOT, entry.manifest);
  return safeReadJson(manifestPath);
}

export function loadOAuthLoginPortalFeature(options = {}) {
  return safeReadJson(path.join(oauthPortalDir(options), 'agentsam.feature.json'));
}

export function loadIdentityProviders(options = {}) {
  const doc = safeReadJson(path.join(oauthPortalDir(options), 'providers.json'));
  return doc?.providers || [];
}

export function getIdentityProviderTemplate(id, options = {}) {
  const key = normalizeProviderTemplateId(id);
  const providers = loadIdentityProviders(options);
  return (
    providers.find((row) => row.id === key) ||
    providers.find((row) => Array.isArray(row.aliases) && row.aliases.includes(String(id || '').trim().toLowerCase())) ||
    null
  );
}

export function loadIdentityResources(options = {}) {
  return safeReadJson(path.join(oauthPortalDir(options), 'resources.json'));
}

export function loadIdentityRoutes(options = {}) {
  return safeReadJson(path.join(oauthPortalDir(options), 'routes.json'));
}

export function loadIdentityUi(options = {}) {
  return safeReadJson(path.join(oauthPortalDir(options), 'ui.json'));
}

/** Compact summary for CLI status lines — real tables + migrations, no fake profile ids. */
export function formatResourcesSummary(resources) {
  if (!resources) return 'resources=(missing)';
  const tables = (resources.tables || []).map((t) => t.name).filter(Boolean);
  const migrations = resources.migration_sources || [];
  const engine = resources.engine || 'unknown';
  return `engine=${engine} tables=${tables.join(',') || '(none)'} migrations=${migrations.join(',') || '(none)'}`;
}

/**
 * `agentsam identity schema` — print the package resources packet (migration SSOT).
 * Optional id filters: d1 | identity | oauth-login-portal | (empty = default packet).
 */
export function loadSchemaProfile(id, options = {}) {
  const key = String(id || '').trim().toLowerCase();
  if (key === 'better-auth-postgres') {
    return {
      id: 'better-auth-postgres',
      engine: 'postgres',
      note: 'Owned by apps/local-studio — not part of packages/identity feature packet.',
      source: 'apps/local-studio/backend/migrations/auth/0001_auth.sql',
      tables: [],
      migration_sources: ['apps/local-studio/backend/migrations/auth/0001_auth.sql'],
    };
  }
  if (key && !['d1', 'identity', 'oauth-login-portal', 'resources', ''].includes(key)) {
    return null;
  }
  return loadIdentityResources(options);
}

export function listSchemaProfiles(options = {}) {
  const resources = loadIdentityResources(options);
  const rows = [];
  if (resources) rows.push(resources);
  const studio = loadSchemaProfile('better-auth-postgres', options);
  if (studio) rows.push(studio);
  return rows;
}

export function featureStatePath(cwd) {
  return path.join(cwd, '.agentsam', 'features.json');
}

export function featuresResolvedPath(cwd) {
  return path.join(cwd, 'generated', '.agentsam', 'features-resolved.json');
}

export function readFeatureSelections(cwd) {
  const file = featureStatePath(cwd);
  if (!fs.existsSync(file)) {
    return { schema_version: 2, features: {} };
  }
  const state = readJson(file);
  return {
    schema_version: Number(state.schema_version) || 1,
    features: state.features && typeof state.features === 'object' ? state.features : {},
  };
}

/**
 * Resolve auth / identity.oauth-login-portal selection against the package packet.
 * Resources come from resources.json (real tables + migration_sources) — not a pretend profile id.
 */
export function resolveAuthFeature(selection = {}, options = {}) {
  const feature = loadOAuthLoginPortalFeature(options);
  if (!feature) throw new Error('identity_oauth_login_portal_feature_missing');

  const catalog = safeReadJson(path.join(oauthPortalDir(options), 'providers.json'));
  const providerId = normalizeProviderTemplateId(
    selection.provider_template ||
    catalog?.default_provider ||
    'inneranimalmedia',
  );
  const provider = getIdentityProviderTemplate(providerId, options);
  if (!provider) throw new Error(`unknown_provider_template:${providerId}`);

  const resources = loadIdentityResources(options);
  if (!resources) throw new Error('identity_resources_missing');

  return {
    id: feature.id,
    selected: selection.selected !== false,
    capabilities: selection.capabilities || feature.provides || [],
    provider_template: providerId,
    selected_at: selection.selected_at || null,
    feature: {
      id: feature.id,
      name: feature.name,
      artifacts: feature.artifacts || [],
      provides: feature.provides || [],
    },
    provider,
    /** Actual portable Identity D1 resources — migration files remain SSOT. */
    resources,
    routes: loadIdentityRoutes(options),
    ui: loadIdentityUi(options),
  };
}

export function resolveFeatures(cwd, options = {}) {
  const selections = options.selections || readFeatureSelections(cwd);
  const resolved = {
    schema: 'agentsam.features.resolved.v1',
    schema_version: 2,
    generated_at: new Date().toISOString(),
    cwd: path.resolve(cwd),
    selections: selections.features,
    features: {},
  };

  for (const [id, selection] of Object.entries(selections.features || {})) {
    if (!selection || selection.selected === false) continue;
    if (id === 'auth' || id === 'identity.oauth-login-portal') {
      resolved.features[id] = resolveAuthFeature(selection, options);
    } else {
      resolved.features[id] = {
        id,
        selected: true,
        capabilities: selection.capabilities || [],
        selected_at: selection.selected_at || null,
        protocol: null,
      };
    }
  }

  return resolved;
}

export function writeFeaturesResolved(cwd, resolved = null, options = {}) {
  const snapshot = resolved || resolveFeatures(cwd, options);
  const outPath = featuresResolvedPath(cwd);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return { path: outPath, snapshot };
}

export function writeFeatureSelections(cwd, state) {
  const next = {
    schema_version: 2,
    features: state.features || {},
  };
  const file = featureStatePath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  const { path: resolvedPath, snapshot } = writeFeaturesResolved(cwd, null, { selections: next });
  return { state_path: file, resolved_path: resolvedPath, snapshot };
}

/** Back-compat alias used by older call sites */
export function loadAuthFeature(options = {}) {
  return loadOAuthLoginPortalFeature(options);
}
