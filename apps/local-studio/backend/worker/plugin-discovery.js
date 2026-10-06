/**
 * Catalog discovery is data, not executable authority. Only operator-configured
 * HTTPS catalog sources may be fetched. Installation is user-scoped, idempotent,
 * and registers NO executable tools until a real auth/connection flow exists.
 */
import { installPlugin, updatePluginPreferences } from '@inneranimalmedia/agentsam-sdk/plugins';
import { loadPluginRegistry } from './plugin-registry.js';

/**
 * Provider-neutral public plugin catalog source validation and projection.
 * Data metadata only: no permissions or executable tools are granted here.
 */
const CATALOG_SCHEMA = 'agentsam.plugin-catalog/v1';
const KEY = /^[a-z0-9][a-z0-9-]{1,79}$/;
export function isCatalogPluginKey(value) {
  return typeof value === 'string' && KEY.test(value);
}
const MAX_SOURCES = 8;
const MAX_PLUGINS = 150;
const MAX_BYTES = 256_000;

function text(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function httpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}
function strings(input, max = 24, length = 150) {
  if (!Array.isArray(input)) return [];
  return input.filter(value=>typeof value === 'string').slice(0,max).map(value=>text(value,length)).filter(Boolean);
}
function link(value) {
  const url = httpUrl(value);
  return url ? url.toString() : null;
}
export function configuredPluginCatalogSources(env) {
  let raw;
  try { raw = JSON.parse(String(env.AGENTSAM_PLUGIN_CATALOG_URLS || '[]')); }
  catch { throw new Error('plugin_catalog_sources_invalid'); }
  if (!Array.isArray(raw) || raw.length > MAX_SOURCES) throw new Error('plugin_catalog_sources_invalid');
  // Prevent loopback/private literal addresses even in operator configuration.
  const forbidden = /^(?:localhost|127(?:\.\d+){3}|0\.0\.0\.0|10(?:\.\d+){3}|192\.168(?:\.\d+){2}|169\.254(?:\.\d+){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d+){2}|\[?::1\]?)$/i;
  const seen = new Set();
  return raw.map(value=>{
    const url = httpUrl(value);
    if (!url || forbidden.test(url.hostname) || url.pathname !== '/catalog/plugins' || url.search) throw new Error('plugin_catalog_source_url_invalid');
    if (seen.has(url.toString())) throw new Error('plugin_catalog_source_duplicate');
    seen.add(url.toString());
    return url;
  });
}

export function normalizeDiscoveredPlugin(input, source) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('plugin_catalog_item_invalid');
  const key = text(input.plugin_key, 81);
  if (!KEY.test(key)) throw new Error('plugin_catalog_key_invalid');
  const sourceUrl = httpUrl(source);
  const endpoint = httpUrl(input.endpoint_url);
  // Never allow an operator-trusted discovery source to redirect plugin
  // execution to a new unreviewed origin via a database row.
  if (!sourceUrl || !endpoint || endpoint.origin !== sourceUrl.origin || !/^\/mcp(?:\/|$)/.test(endpoint.pathname) || endpoint.search) {
    throw new Error('plugin_catalog_endpoint_invalid');
  }
  if (input.auth_type !== 'oauth' || input.transport !== 'streamable-http') throw new Error('plugin_catalog_protocol_unsupported');
  const name = text(input.display_name, 100);
  if (!name) throw new Error('plugin_catalog_display_name_missing');
  const icon = httpUrl(input.icon_url);
  const iconUrl = icon && icon.origin === sourceUrl.origin
    && /^\/catalog\/icons\/[a-z0-9-]+\.png$/.test(icon.pathname)
    ? icon.toString() : null;
  return {
    pluginKey: key,
    version: text(input.version, 40),
    name,
    subtitle: text(input.short_description, 180),
    description: text(input.description, 1600),
    publisher: text(input.developer_name, 100),
    iconUrl,
    category: text(input.category, 55) || 'Other',
    keywords: strings(input.keywords, 20, 50),
    capabilities: strings(input.capabilities, 25, 150),
    examples: strings(input.example_prompts, 8, 400),
    tools: strings(input.tools, 150, 120),
    toolCount: Number.isInteger(input.tool_count) && input.tool_count >= 0 ? input.tool_count : 0,
    skillCount: Number.isInteger(input.skill_count) && input.skill_count >= 0 ? input.skill_count : 0,
    endpointUrl: endpoint.toString(),
    catalogUrl: sourceUrl.toString(),
    transport: 'streamable-http',
    authType: 'oauth',
    websiteUrl: link(input.website_url),
    privacyUrl: link(input.privacy_url),
    termsUrl: link(input.terms_url),
    supportUrl: link(input.support_url),
    repositoryUrl: link(input.repository_url),
    availability: 'requires_connection',
  };
}

export async function discoverPublicPlugins(env, requestFetch = fetch) {
  const sources = configuredPluginCatalogSources(env);
  const plugins = [];
  const failures = [];
  const keys = new Set();
  for (const url of sources) {
    try {
      const response = await requestFetch(url.toString(), {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error('upstream_unavailable');
      if (Number(response.headers.get('content-length') || '0') > MAX_BYTES) throw new Error('upstream_too_large');
      const body = await response.text();
      if (body.length > MAX_BYTES) throw new Error('upstream_too_large');
      const catalog = JSON.parse(body);
      if (catalog.schema !== CATALOG_SCHEMA || !Array.isArray(catalog.plugins) || catalog.plugins.length > MAX_PLUGINS) {
        throw new Error('schema_invalid');
      }
      // All-or-nothing per catalog: don't install from a partial/invalid listing.
      const validated = catalog.plugins.map(plugin=>normalizeDiscoveredPlugin(plugin,url.toString()));
      if (validated.some(plugin=>keys.has(plugin.pluginKey)) || new Set(validated.map(plugin=>plugin.pluginKey)).size !== validated.length) {
        throw new Error('duplicate_plugin_key');
      }
      validated.forEach(plugin=>{keys.add(plugin.pluginKey);plugins.push(plugin);});
    } catch (error) {
      console.warn('plugin_catalog_source_unavailable',url.origin,String(error?.message || 'error').slice(0,90));
      failures.push({ source: url.origin, reason: 'catalog_unavailable' });
    }
  }
  return {
    schema: CATALOG_SCHEMA,
    plugins,
    errors: failures,
    configuredSources: sources.length,
  };
}

export async function listCatalogForAccount(env, accountId, fetcher = fetch) {
  const [catalog, installed] = await Promise.all([
    discoverPublicPlugins(env,fetcher),
    loadPluginRegistry(env,accountId,{includeDisabled:true}),
  ]);
  const byKey = new Map(installed.plugins.map(row=>[row.plugin_key,row]));
  return {
    ...catalog,
    plugins: catalog.plugins.map(plugin=>{
      const row = byKey.get(plugin.pluginKey);
      return {
        ...plugin,
        installationId: row?.id || null,
        setupStatus: row?.setup_status || 'not_installed',
        enabled: row?.is_enabled === true || row?.is_enabled === 1,
        healthStatus: row?.health_status || 'unknown',
        // A D1 row is not proof of an authorized MCP connection.
        availability: row?.setup_status === 'connected'
          && Number(row?.is_enabled) === 1
          && row?.health_status === 'healthy'
          && installed.tools.some(tool=>tool.plugin_id === row?.id)
          ? 'connected' : row ? 'requires_connection' : 'available',
      };
    }),
  };
}

export async function installFromCatalog(env,accountId,pluginKey,fetcher=fetch) {
  if (!isCatalogPluginKey(pluginKey)) throw new Error('plugin_catalog_key_invalid');
  const catalog = await discoverPublicPlugins(env,fetcher);
  const entry = catalog.plugins.find(plugin=>plugin.pluginKey===pluginKey);
  if (!entry && catalog.errors.length === catalog.configuredSources && catalog.configuredSources > 0) {
    throw new Error('plugin_catalog_unavailable');
  }
  if (!entry) throw new Error('plugin_catalog_entry_not_found');
  const registry = await loadPluginRegistry(env,accountId,{includeDisabled:true});
  const existing = registry.plugins.find(row=>row.plugin_key === pluginKey);
  if (existing && existing.installation_key !== 'catalog-v1') {
    throw new Error('plugin_installation_conflict');
  }
  if (existing) {
    // Idempotent: a second add request never overwrites an existing authorized
    // connection, tool inventory, custom scopes, health state, or user choices.
    if (existing.endpoint_url !== entry.endpointUrl) {
      throw new Error('plugin_endpoint_changed_requires_reconnect');
    }
    return {
      pluginId: existing.id,
      pluginKey: entry.pluginKey,
      status: existing.setup_status === 'connected' ? 'connected' : 'requires_connection',
    };
  }
  const manifest = {
    plugin_key: entry.pluginKey,
    provider_key: entry.pluginKey,
    installation_key: 'catalog-v1',
    plugin_kind: 'mcp',
    category: entry.category.toLowerCase(),
    display_name: entry.name,
    description: entry.description || entry.subtitle,
    endpoint_url: entry.endpointUrl,
    transport: 'remote_jsonrpc',
    auth_type: 'oauth',
    mention_aliases: ['@'+entry.pluginKey],
    capabilities: [], // tool and permission activation is a separate authenticated step
    tools: [], // never allow a catalog payload to register executable tools
    composer_visible: false,
    settings_visible: true,
    health_strategy: 'oauth_probe',
    metadata: {source:entry.catalogUrl,version:entry.version,requires_authorization:true,
      declared_tools:entry.toolCount,privacy_url:entry.privacyUrl,terms_url:entry.termsUrl},
  };
  const installed = await installPlugin(env.DB,{
    accountId,
    environment:'production',
    manifest,
    preserveEnabled:true,
  });
  await updatePluginPreferences(env.DB,{accountId,pluginId:installed.plugin_id,enabled:false,composerVisible:false});
  return {pluginId:installed.plugin_id,pluginKey:entry.pluginKey,status:'requires_connection'};
}

export async function removeCatalogInstallation(env,accountId,pluginId) {
  if (!/^plg_[a-z0-9]+$/i.test(pluginId)) throw new Error('plugin_id_invalid');
  const row = await env.DB.prepare(
    'SELECT id FROM agentsam_plugins WHERE id = ? AND account_id = ? AND installation_key = ? LIMIT 1'
  ).bind(pluginId,accountId,'catalog-v1').first();
  if (!row) throw new Error('plugin_installation_not_found');
  const tools = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM agentsam_tools WHERE plugin_id = ? AND account_id = ?'
  ).bind(pluginId,accountId).first();
  if (Number(tools?.total || 0) > 0) throw new Error('plugin_remove_requires_disconnect');
  await env.DB.prepare(
    'DELETE FROM agentsam_plugins WHERE id = ? AND account_id = ? AND installation_key = ?'
  ).bind(pluginId,accountId,'catalog-v1').run();
  return {pluginId,removed:true};
}
