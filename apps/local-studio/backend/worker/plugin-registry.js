import {
  CLOUDFLARE_PLUGIN_MANIFEST,
  installPlugin,
  listPlugins,
  listPluginTools,
  updatePluginPreferences,
  recordPluginHealthCheck,
  createPluginRuntime,
  executeVectorizeTool,
} from '@inneranimalmedia/agentsam-sdk/plugins';
import { probeCloudflareConnection } from '@inneranimalmedia/agentsam-connector-cloudflare';
import { callCloudflareMcpTool, executeAgentSamCloudflareProgram, searchCloudflareApi } from './cloudflare-code-mode.js';
import { executeCompletefulNative } from './completeful-native.js';
import { runRemotePluginTool } from './plugin-oauth.js';

function withFailureOrigin(error, origin) {
  const failure = error && typeof error === 'object' ? error : new Error(String(error));
  if (!failure.failureOrigin && !failure.failure_origin) failure.failureOrigin = origin;
  return failure;
}

const LOCAL_STUDIO_CLOUDFLARE_MANIFEST = Object.freeze({
  ...CLOUDFLARE_PLUGIN_MANIFEST,
  installation_key: 'local-studio-pkce',
});

export async function materializeCloudflarePlugin(env, accountId, options = {}) {
  const installed = await installPlugin(env.DB, {
    accountId,
    environment: options.environment || 'production',
    manifest: LOCAL_STUDIO_CLOUDFLARE_MANIFEST,
    // Registry refreshes should update manifest metadata without silently
    // undoing a user's Settings-level enable/disable preference.
    preserveEnabled: true,
  });
  const probe = options.connected ? await probeCloudflareConnection(env, accountId) : null;
  if (probe) {
    await recordPluginHealthCheck(env.DB, {
      pluginId: installed.plugin_id,
    pluginKey: 'agentsam-mcp',
      accountId,
      environment: options.environment || 'production',
      checkKind: 'oauth_probe',
      checkSource: options.checkSource || 'page_load',
      status: probe.status,
      startedAt: probe.checked_at,
      completedAt: Math.floor(Date.now() / 1000),
      latencyMs: probe.latency_ms,
      httpStatus: probe.http_status,
      providerRequestId: probe.provider_request_id,
      errorCode: probe.error_code,
      errorMessage: probe.error_message,
      details: { account_id: probe.account_id || null, scopes: probe.scopes || [] },
    });
  }
  await env.DB.prepare(`
    UPDATE agentsam_plugin_installations SET setup_status=?,
      health_status=CASE WHEN ? THEN health_status ELSE 'unknown' END,
      last_error_code=CASE WHEN ? THEN last_error_code ELSE NULL END,
      last_error_message=CASE WHEN ? THEN last_error_message ELSE NULL END,
      updated_at=unixepoch()
    WHERE plugin_id=? AND account_id=?
  `).bind(
    options.connected ? 'connected' : options.available === false ? 'unconfigured' : 'configured',
    options.connected ? 1 : 0,
    options.connected ? 1 : 0,
    options.connected ? 1 : 0,
    installed.plugin_id,
    accountId,
  ).run();
  return { installed, probe };
}

export async function loadPluginRegistry(env, accountId, options = {}) {
  const includeDisabled = options.includeDisabled === true;
  // An unavailable optional tool enumeration must not erase installed plugin
  // definitions, OAuth status, or account authorization history in Settings.
  const [plugins, tools] = await Promise.all([
    listPlugins(env.DB, { accountId, environment: 'production', includeDisabled }),
    listPluginTools(env.DB, { accountId, includeDisabledPlugins: includeDisabled }).catch(error => {
      console.warn('installed_plugin_tools_unavailable',String(error?.message||error).slice(0,120));
      return null;
    }),
  ]);
  return { plugins, tools:tools || [], toolsVerified:tools !== null };
}

export async function updateLocalStudioPluginPreferences(env, accountId, pluginId, value = {}) {
  return updatePluginPreferences(env.DB, {
    accountId,
    pluginId,
    enabled: value.enabled,
    composerVisible: value.composer_visible,
    settingsVisible: value.settings_visible,
  });
}

async function recordToolHealth(env, accountId, plugin, status, startedAt, error = null) {
  const completedMs = Date.now();
  const completedAt = Math.floor(completedMs / 1000);
  await recordPluginHealthCheck(env.DB, {
    pluginId: plugin.id,
    pluginKey: plugin.plugin_key,
    accountId,
    environment: plugin.environment,
    checkKind: 'tool_execution',
    checkSource: 'tool_call',
    status,
    startedAt: Math.floor(startedAt / 1000),
    completedAt,
    latencyMs: Math.max(0, completedMs - startedAt),
    errorCode: error?.code || (error ? 'plugin_tool_failed' : null),
    errorMessage: error ? String(error.message || error).slice(0, 240) : null,
  });
}

export async function createLocalStudioPluginRuntime(env, accountId, options = {}) {
  let registry = await loadPluginRegistry(env, accountId);
  let plugin = registry.plugins.find((row) => row.plugin_key === 'agentsam-mcp');
  if (!plugin) {
    await materializeCloudflarePlugin(env, accountId, { connected: true, checkSource: 'tool_call' });
    registry = await loadPluginRegistry(env, accountId);
    plugin = registry.plugins.find((row) => row.plugin_key === 'agentsam-mcp');
  }
  const dispatch = async ({ tool, args }) => {
    if (!plugin) throw new Error('cloudflare_plugin_not_installed');
    const startedAt = Date.now();
    try {
      let result;
      if (tool.tool_key === 'agentsam-mcp.docs' || tool.tool_key === 'agentsam-mcp.search') {
        result = await searchCloudflareApi(args.query || args.code);
      } else if (tool.tool_key === 'agentsam-mcp.execute') {
        result = await executeAgentSamCloudflareProgram(env, accountId, args.code);
      } else {
        throw new Error(`cloudflare_tool_unsupported:${tool.tool_key}`);
      }
      await recordToolHealth(env, accountId, plugin, 'healthy', startedAt);
      return result;
    } catch (error) {
      const failure = withFailureOrigin(error, 'provider');
      const status = /connection|auth/i.test(String(failure?.message || '')) ? 'auth_error' : 'unhealthy';
      await recordToolHealth(env, accountId, plugin, status, startedAt, failure);
      throw failure;
    }
  };
  const mcpDispatch = async ({ tool, args }) => {
    const startedAt = Date.now();
    try {
      const owner = registry.plugins.find(row => row.plugin_key === tool.plugin_key);
      const result = owner?.installation_key === 'catalog-v1'
        ? await runRemotePluginTool(env, accountId, tool, args, options.mcpFetch || fetch)
        : await callCloudflareMcpTool(tool.handler_config?.remote_tool || tool.handler_key, args, {
            endpoint: tool.handler_config?.server_url,
          });
      if(owner)await recordToolHealth(env, accountId, owner, 'healthy', startedAt);
      return result;
    } catch (error) {
      const failure = withFailureOrigin(error, 'provider');
      const owner=registry.plugins.find(row=>row.plugin_key===tool.plugin_key);
      if(owner)await recordToolHealth(env, accountId, owner, /auth|scope|token/i.test(String(failure?.message||''))?'auth_error':'unhealthy', startedAt, failure);
      throw failure;
    }
  };
  const nativeDispatch = async (entry) => {
    const { tool, args, context } = entry;
    const registeredHandler = options.handlers?.[tool.handler_key];
    if (typeof registeredHandler === 'function') return registeredHandler(entry);
    if (tool.handler_config?.executor === 'vectorize' || tool.handler_key === 'vectorize') {
      return executeVectorizeTool({ tool, args, context: { ...context, env } });
    }
    if (tool.handler_key === 'completeful' || tool.plugin_key === 'completeful') {
      return executeCompletefulNative(env, tool, args);
    }
    throw new Error(`native_handler_unavailable:${tool.handler_key || 'unknown'}`);
  };
  return createPluginRuntime({
    tools: registry.tools,
    accountId,
    db: env.DB,
    dispatchers: { plugin: dispatch, codemode: dispatch, mcp: mcpDispatch, native: nativeDispatch, internal: nativeDispatch },
    handlers: options.handlers,
    // The runtime was resolved for this signed-in account. A caller-supplied
    // context may narrow that principal but must never switch to another one.
    authorizeTool: async (entry) => {
      const requestedAccount = entry.context?.accountId;
      if (requestedAccount && requestedAccount !== accountId) return false;
      if (entry.tool?.account_id && entry.tool.account_id !== accountId) return false;
      return typeof options.authorizeTool === 'function'
        ? options.authorizeTool(entry)
        : true;
    },
    requireApproval: options.requireApproval,
    resolveCost: options.resolveCost,
  });
}
