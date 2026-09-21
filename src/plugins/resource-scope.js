function clean(value) { return value == null ? '' : String(value).trim(); }

export function resolveProjectPluginResources(projectConfig, pluginKey, resourceKey = null) {
  return resolveProjectPluginScope(projectConfig, pluginKey, resourceKey);
}

export function resolveProjectRuntimeResources(projectConfig, pluginKey, resourceKey = null) {
  const scope = resolveProjectPluginScope(projectConfig, pluginKey, resourceKey);
  return Object.freeze({
    project_name: clean(projectConfig?.project?.name) || null,
    repository_id: clean(projectConfig?.repository?.id) || null,
    plugin_key: scope.plugin_key,
    resource_key: scope.resource_key || resourceKey || null,
    resource: scope,
  });
}

/** Resolve only the active project's declared resource scope. */
export function resolveProjectPluginScope(projectConfig, pluginKey, resourceKey = null) {
  const key = clean(pluginKey).replace(/^@/, '');
  if (!key) throw new Error('plugin_key_required');
  const plugins = projectConfig?.plugins || projectConfig?.integrations || {};
  const plugin = plugins[key] || plugins[`@${key}`];
  if (!plugin || typeof plugin !== 'object') throw new Error(`project_plugin_scope_missing:${key}`);
  const resources = plugin.resources && typeof plugin.resources === 'object' ? plugin.resources : plugin;
  if (resourceKey == null) return { plugin_key: key, ...resources };
  const resource = resources[resourceKey];
  if (!resource || typeof resource !== 'object') throw new Error(`project_resource_missing:${key}:${resourceKey}`);
  return { plugin_key: key, resource_key: resourceKey, ...resource };
}

export function resolveProjectVectorizeScope(projectConfig, options = {}) {
  const pluginKey = clean(options.pluginKey || 'cloudflare');
  const resourceKey = clean(options.resourceKey || options.index || options.binding);
  const scope = resolveProjectPluginScope(projectConfig, pluginKey, resourceKey || null);
  const vectorize = scope.vectorize || scope;
  const binding = clean(options.binding || vectorize.binding || vectorize.binding_name);
  const index = clean(options.index || vectorize.index || vectorize.index_name);
  const model = clean(options.model || vectorize.model || vectorize.embedding_model);
  const dimensions = Number(options.dimensions || vectorize.dimensions || vectorize.dimension);
  if (!binding || !index || !model || !Number.isInteger(dimensions) || dimensions < 1) {
    throw new Error(`project_vectorize_scope_incomplete:${pluginKey}:${resourceKey || 'default'}`);
  }
  return Object.freeze({ plugin_key: pluginKey, resource_key: resourceKey || null, binding, index, model, dimensions });
}
