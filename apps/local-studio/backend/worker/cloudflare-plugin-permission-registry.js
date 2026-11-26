/**
 * Local Studio adapter for OAuth permission metadata stored on registered plugins.
 *
 * The Cloudflare connector consumes a provider-neutral catalog contract. Only
 * this host adapter knows that Local Studio stores plugin metadata in
 * agentsam_plugins.config_json.
 */

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function humanizeScope(scope) {
  return String(scope || '')
    .replace(/\.(read|write|run|send|purge|index)$/i, ' $1')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function createPluginOAuthPermissionRegistry(env, options = {}) {
  return {
    async getOAuthPermissionCatalog(providerKey) {
      if (!env?.DB?.prepare) return null;
      const normalizedProvider = String(providerKey || '').trim().toLowerCase();
      const pluginKey = String(options.pluginKeys?.[normalizedProvider] || (
        normalizedProvider === 'cloudflare' ? 'agentsam-mcp' : ''
      )).trim();
      if (!pluginKey) return null;

      let row;
      try {
        row = await env.DB.prepare(
          "SELECT id,plugin_key,config_json FROM agentsam_plugins " +
          "WHERE plugin_key=? AND provider_key=? AND plugin_kind='oauth' LIMIT 1",
        ).bind(pluginKey, normalizedProvider).first();
      } catch {
        return null;
      }
      if (!row) return null;

      let config;
      try {
        config = JSON.parse(row.config_json || '{}');
      } catch {
        return null;
      }
      const source = config?.oauth_permissions;
      if (!source || typeof source !== 'object' || Number(source.version || 0) !== 1) return null;

      const packs = (Array.isArray(source.packs) ? source.packs : []).map((pack) => ({
        id: pack.id,
        label: pack.label,
        description: pack.description,
        scopes: unique([
          ...(Array.isArray(pack.scopes) ? pack.scopes : []),
          ...(Array.isArray(pack.read_scopes) ? pack.read_scopes : []),
          ...(Array.isArray(pack.write_scopes) ? pack.write_scopes : []),
        ]),
        capabilities: unique(pack.capabilities),
      }));
      const capabilities = (Array.isArray(source.capabilities) ? source.capabilities : []).map((capability) => ({
        id: capability.id,
        label: capability.label,
        scopes: unique(capability.scopes),
      }));
      const baselineScopes = unique(source.baseline_scopes);
      const defaultPacks = unique(source.default_packs);
      const defaultCapabilities = unique(source.default_capabilities);
      const aliases = source.aliases && typeof source.aliases === 'object' ? source.aliases : {};
      const scopeCategories = new Map();
      for (const pack of packs) {
        for (const scope of pack.scopes) {
          if (!scopeCategories.has(scope)) scopeCategories.set(scope, new Set());
          scopeCategories.get(scope).add(pack.id);
        }
      }
      for (const capability of capabilities) {
        for (const scope of capability.scopes) {
          if (!scopeCategories.has(scope)) scopeCategories.set(scope, new Set());
        }
      }
      for (const scope of baselineScopes) {
        if (!scopeCategories.has(scope)) scopeCategories.set(scope, new Set(['identity']));
      }

      const permissionRows = new Map();
      for (const permission of Array.isArray(source.available_permissions) ? source.available_permissions : []) {
        const scope = String(permission?.scope || '').trim();
        if (!scope) continue;
        permissionRows.set(scope, {
          scope,
          label: String(permission.label || humanizeScope(scope)),
          category: String(permission.category || 'provider'),
        });
      }
      for (const [scope, categories] of scopeCategories.entries()) {
        if (!permissionRows.has(scope)) {
          permissionRows.set(scope, {
            scope,
            label: humanizeScope(scope),
            category: [...categories].join(',') || 'provider',
          });
        }
      }

      return {
        providerKey: normalizedProvider,
        pluginId: row.id,
        pluginKey: row.plugin_key,
        version: Number(source.version),
        baselineScopes,
        defaultPacks,
        defaultCapabilities,
        aliases,
        allowFullCatalogOptIn: source.allow_full_catalog_opt_in === true,
        packs,
        capabilities,
        availablePermissions: [...permissionRows.values()].sort((a, b) => a.scope.localeCompare(b.scope)),
      };
    },
    async getActiveGrantedScopes({ ownerId, providerKey, accountIdentifier } = {}) {
      if (!env?.DB?.prepare || !ownerId || !providerKey || !accountIdentifier) return null;
      try {
        const row = await env.DB.prepare(
          'SELECT scopes FROM user_oauth_tokens WHERE account_id=? AND LOWER(provider)=LOWER(?) ' +
          'AND account_identifier=? AND is_active=1 AND revoked_at IS NULL LIMIT 1',
        ).bind(String(ownerId), String(providerKey), String(accountIdentifier)).first();
        if (!row) return [];
        return unique(String(row.scopes || '').split(/\s+/));
      } catch {
        return null;
      }
    },
  };
}

