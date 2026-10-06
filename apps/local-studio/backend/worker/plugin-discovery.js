/**
 * Catalog discovery is data, not executable authority. Only operator-configured
 * HTTPS catalog sources may be fetched. Installation is user-scoped, idempotent,
 * and registers NO executable tools until a real auth/connection flow exists.
 */
import { installPlugin, updatePluginPreferences } from '@inneranimalmedia/agentsam-sdk/plugins';
// Use the monorepo's exact source while 2.6.12 is immutable. The next SDK
// release also exports this module through @inneranimalmedia/agentsam-sdk/plugins.
import { discoverPublicPlugins, isCatalogPluginKey } from '../../../../src/plugins/discovery.js';
export {
  configuredPluginCatalogSources,
  normalizeDiscoveredPlugin,
  discoverPublicPlugins,
} from '../../../../src/plugins/discovery.js';
import { loadPluginRegistry } from './plugin-registry.js';

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
  if (existing && existing.setup_status === 'connected' && existing.endpoint_url !== entry.endpointUrl) {
    throw new Error('plugin_endpoint_changed_requires_reconnect');
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
  if (!existing) {
    await updatePluginPreferences(env.DB,{accountId,pluginId:installed.plugin_id,enabled:false,composerVisible:false});
  }
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
