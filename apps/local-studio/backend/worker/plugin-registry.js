import {
  CLOUDFLARE_PLUGIN_MANIFEST,
  installPlugin,
  listPlugins,
  listPluginTools,
  recordPluginHealthCheck,
  createPluginRuntime,
  executeVectorizeTool,
} from '@inneranimalmedia/agentsam-sdk/plugins';
import { probeCloudflareConnection } from '../../../../packages/connectors/cloudflare/src/index.js';
import { callCloudflareMcpTool, executeAgentSamCloudflareProgram, searchCloudflareApi } from './cloudflare-code-mode.js';
import { executeCompletefulNative } from './completeful-native.js';

const LOCAL_STUDIO_CLOUDFLARE_MANIFEST = Object.freeze({
  ...CLOUDFLARE_PLUGIN_MANIFEST,
  installation_key: 'local-studio-pkce',
});

export async function materializeCloudflarePlugin(env, accountId, options = {}) {
  const installed = await installPlugin(env.DB, {
    accountId,
    environment: options.environment || 'production',
    manifest: LOCAL_STUDIO_CLOUDFLARE_MANIFEST,
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
    UPDATE agentsam_plugins SET setup_status=?,
      health_status=CASE WHEN ? THEN health_status ELSE 'unknown' END,
      last_error_code=CASE WHEN ? THEN last_error_code ELSE NULL END,
      last_error_message=CASE WHEN ? THEN last_error_message ELSE NULL END,
      updated_at=unixepoch()
    WHERE id=? AND account_id=?
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

export async function loadPluginRegistry(env, accountId) {
  const [plugins, tools] = await Promise.all([
    listPlugins(env.DB, { accountId, environment: 'production' }),
    listPluginTools(env.DB, { accountId }),
  ]);
  return { plugins, tools };
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
      const status = /connection|auth/i.test(String(error?.message || '')) ? 'auth_error' : 'unhealthy';
      await recordToolHealth(env, accountId, plugin, status, startedAt, error);
      throw error;
    }
  };
  const mcpDispatch = async ({ tool, args }) => {
    const startedAt = Date.now();
    try {
      const result = await callCloudflareMcpTool(tool.handler_config?.remote_tool || tool.handler_key, args, {
        endpoint: tool.handler_config?.server_url,
      });
      await recordToolHealth(env, accountId, plugin, 'healthy', startedAt);
      return result;
    } catch (error) {
      await recordToolHealth(env, accountId, plugin, 'unhealthy', startedAt, error);
      throw error;
    }
  };
  const nativeDispatch = async ({ tool, args, context }) => {
    if (tool.handler_type === 'vectorize') {
      return executeVectorizeTool({ tool, args, context: { ...context, env } });
    }
    if (tool.handler_key === 'completeful' || tool.plugin_key === 'completeful') {
      return executeCompletefulNative(env, tool, args);
    }
    throw new Error(`native_handler_unavailable:${tool.handler_type || tool.handler_key || 'unknown'}`);
  };
  return createPluginRuntime({
    tools: registry.tools,
    db: env.DB,
    dispatchers: { plugin: dispatch, codemode: dispatch, mcp: mcpDispatch, native: nativeDispatch, internal: nativeDispatch },
    authorizeTool: options.authorizeTool,
    requireApproval: options.requireApproval,
  });
}
