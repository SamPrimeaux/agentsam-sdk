import { normalizePluginManifest } from './contracts.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function json(value, fallback) { try { return JSON.parse(String(value ?? '')); } catch { return fallback; } }
function id(prefix) { return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`; }

export async function installPlugin(db, options = {}) {
  if (!db?.prepare) throw new TypeError('D1-compatible database binding required');
  const accountId = clean(options.accountId);
  const environment = clean(options.environment || 'production');
  if (!accountId) throw new Error('plugin_account_id_required');
  const manifest = normalizePluginManifest(options.manifest);
  let plugin = await db.prepare(`
    SELECT id FROM agentsam_plugins
    WHERE account_id = ? AND environment = ? AND plugin_key = ? AND installation_key = ?
    LIMIT 1
  `).bind(accountId, environment, manifest.plugin_key, manifest.installation_key).first();
  const pluginId = plugin?.id || id('plg');
  const values = [
    manifest.provider_key, manifest.plugin_kind, manifest.category, manifest.display_name, manifest.short_name,
    manifest.description, JSON.stringify(manifest.mention_aliases), manifest.endpoint_url, manifest.transport,
    manifest.auth_type, manifest.secret_ref, manifest.oauth_connect_url,
    JSON.stringify(manifest.capabilities.map((row) => row.capability_key)), JSON.stringify(manifest.tool_lanes),
    JSON.stringify(manifest.resource_scope), JSON.stringify(manifest.config), JSON.stringify(manifest.metadata),
    manifest.icon_url, manifest.icon_dark_url, manifest.icon_alt, manifest.icon_fit,
    manifest.composer_visible ? 1 : 0, manifest.settings_visible ? 1 : 0, manifest.sort_priority,
    manifest.health_strategy,
  ];
  if (plugin?.id) {
    await db.prepare(`
      UPDATE agentsam_plugins SET
        provider_key=?, plugin_kind=?, category=?, display_name=?, short_name=?, description=?, mention_aliases_json=?,
        endpoint_url=?, transport=?, auth_type=?, secret_ref=?, oauth_connect_url=?, capabilities_json=?, tool_lanes_json=?,
        resource_scope_json=?, config_json=?, metadata_json=?, icon_url=?, icon_dark_url=?, icon_alt=?, icon_fit=?,
        composer_visible=?, settings_visible=?, sort_priority=?, health_strategy=?, is_enabled=1, updated_at=unixepoch()
      WHERE id=?
    `).bind(...values, pluginId).run();
  } else {
    await db.prepare(`
      INSERT INTO agentsam_plugins (
        id, account_id, plugin_key, provider_key, installation_key, environment, plugin_kind, category,
        display_name, short_name, description, mention_aliases_json, endpoint_url, transport, auth_type,
        secret_ref, oauth_connect_url, capabilities_json, tool_lanes_json, resource_scope_json, config_json,
        metadata_json, icon_url, icon_dark_url, icon_alt, icon_fit, composer_visible, settings_visible,
        sort_priority, is_enabled, setup_status, health_strategy, health_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'unconfigured', ?, 'unknown', unixepoch(), unixepoch())
    `).bind(pluginId, accountId, manifest.plugin_key, manifest.provider_key, manifest.installation_key, environment, ...values.slice(1)).run();
  }

  for (const capability of manifest.capabilities) {
    await db.prepare(`
      INSERT INTO agentsam_capabilities (capability_key, domain, verb, description, is_mutating, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, unixepoch(), unixepoch())
      ON CONFLICT(capability_key) DO UPDATE SET
        domain=excluded.domain, verb=excluded.verb, description=excluded.description,
        is_mutating=excluded.is_mutating, is_active=1, updated_at=unixepoch()
    `).bind(capability.capability_key, capability.domain, capability.verb, capability.description, capability.is_mutating ? 1 : 0).run();
  }

  for (const tool of manifest.tools) {
    const existing = await db.prepare(`
      SELECT id, tool_name FROM agentsam_tools
      WHERE plugin_id = ? AND account_id = ? AND tool_key = ?
      LIMIT 1
    `).bind(pluginId, accountId, tool.tool_key).first();
    const toolId = existing?.id || id('ast');
    // The canonical schema intentionally keeps tool_name globally unique even
    // though installed tools belong to an account. tool_key is the stable,
    // model-facing identifier; tool_name is an internal unique function name.
    const installedToolName = existing?.tool_name || `${tool.tool_name}__${toolId}`;
    if (existing?.id) {
      await db.prepare(`
        UPDATE agentsam_tools SET
          display_name=?, tool_category=?, handler_type=?, description=?, input_schema=?, output_schema=?, handler_config=?,
          intent_tags=?, risk_level=?, requires_approval=?, requires_confirmation=?, is_active=?, updated_at=unixepoch(),
          tool_key=?, capability_key=?, handler_key=?, domain=?, oauth_visible=1, dispatch_target=?, connector_visible=?,
          connector_priority=?, connector_access_class=?, account_id=?, plugin_key=?, plugin_id=?
        WHERE id=?
      `).bind(
        tool.display_name, tool.tool_category, tool.handler_type, tool.description, JSON.stringify(tool.input_schema),
        tool.output_schema ? JSON.stringify(tool.output_schema) : null, JSON.stringify(tool.handler_config), JSON.stringify(tool.intent_tags),
        tool.risk_level, tool.requires_approval ? 1 : 0, tool.requires_confirmation ? 1 : 0, tool.is_active ? 1 : 0,
        tool.tool_key, tool.capability_key, tool.handler_key, manifest.provider_key, tool.dispatch_target,
        tool.connector_visible ? 1 : 0, manifest.sort_priority, tool.connector_access_class, accountId, manifest.plugin_key, pluginId, toolId,
      ).run();
    } else {
      await db.prepare(`
        INSERT INTO agentsam_tools (
          id, tool_name, display_name, tool_category, handler_type, description, input_schema, output_schema,
          handler_config, intent_tags, risk_level, requires_approval, requires_confirmation, is_active,
          tool_key, capability_key, handler_key, domain, oauth_visible, dispatch_target, connector_visible,
          connector_priority, connector_access_class, account_id, plugin_key, plugin_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
      `).bind(
        toolId, installedToolName, tool.display_name, tool.tool_category, tool.handler_type, tool.description,
        JSON.stringify(tool.input_schema), tool.output_schema ? JSON.stringify(tool.output_schema) : null,
        JSON.stringify(tool.handler_config), JSON.stringify(tool.intent_tags), tool.risk_level,
        tool.requires_approval ? 1 : 0, tool.requires_confirmation ? 1 : 0, tool.is_active ? 1 : 0,
        tool.tool_key, tool.capability_key, tool.handler_key, manifest.provider_key, tool.dispatch_target,
        tool.connector_visible ? 1 : 0, manifest.sort_priority, tool.connector_access_class, accountId, manifest.plugin_key, pluginId,
      ).run();
    }
    await db.prepare(`
      INSERT OR REPLACE INTO agentsam_tool_capabilities
        (tool_id, capability_key, requirement_type, is_primary, operations_json, created_at)
      VALUES (?, ?, 'required', 1, ?, unixepoch())
    `).bind(toolId, tool.capability_key, JSON.stringify([tool.handler_key])).run();
  }
  return { plugin_id: pluginId, account_id: accountId, plugin_key: manifest.plugin_key, tools: manifest.tools.length };
}

export async function listPlugins(db, options = {}) {
  const accountId = clean(options.accountId);
  const environment = clean(options.environment || 'production');
  const result = await db.prepare(`
    SELECT * FROM agentsam_plugins
    WHERE account_id = ? AND environment = ? AND is_enabled = 1
    ORDER BY sort_priority, display_name
  `).bind(accountId, environment).all();
  return (result?.results || []).map((row) => ({
    ...row,
    mention_aliases: json(row.mention_aliases_json, []), capabilities: json(row.capabilities_json, []),
    tool_lanes: json(row.tool_lanes_json, []), resource_scope: json(row.resource_scope_json, {}),
    config: json(row.config_json, {}), metadata: json(row.metadata_json, {}),
  }));
}

export async function listPluginTools(db, options = {}) {
  const accountId = clean(options.accountId);
  const result = await db.prepare(`
    SELECT t.* FROM agentsam_tools t
    JOIN agentsam_plugins p ON p.id = t.plugin_id
    WHERE t.account_id = ? AND t.is_active = 1 AND p.is_enabled = 1
    ORDER BY t.connector_priority, t.sort_priority, t.tool_name
  `).bind(accountId).all();
  return (result?.results || []).map((row) => ({
    ...row, input_schema: json(row.input_schema, {}), output_schema: json(row.output_schema, null),
    handler_config: json(row.handler_config, {}), intent_tags: json(row.intent_tags, []),
  }));
}

export async function recordPluginHealthCheck(db, value = {}) {
  const startedAt = Number(value.startedAt || Math.floor(Date.now() / 1000));
  const completedAt = Number(value.completedAt || Math.floor(Date.now() / 1000));
  const checkId = id('plgh');
  await db.prepare(`
    INSERT INTO agentsam_plugin_health_checks (
      id, plugin_id, plugin_key, account_id, environment, check_kind, check_source, status,
      started_at, completed_at, latency_ms, http_status, provider_request_id, error_code, error_message, details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
  `).bind(
    checkId, value.pluginId, value.pluginKey, value.accountId, value.environment || 'production', value.checkKind || 'adapter',
    value.checkSource || 'manual', value.status, startedAt, completedAt, value.latencyMs ?? null, value.httpStatus ?? null,
    value.providerRequestId || null, value.errorCode || null, value.errorMessage || null, JSON.stringify(value.details || {}),
  ).run();
  const healthy = value.status === 'healthy';
  await db.prepare(`
    UPDATE agentsam_plugins SET health_status=?, last_health_at=?,
      last_healthy_at=CASE WHEN ? THEN ? ELSE last_healthy_at END,
      consecutive_failures=CASE WHEN ? THEN 0 ELSE consecutive_failures + 1 END,
      avg_latency_ms=CASE
        WHEN ? IS NULL THEN avg_latency_ms
        WHEN avg_latency_ms IS NULL THEN ?
        ELSE ((avg_latency_ms * 4) + ?) / 5
      END,
      error_rate_24h=COALESCE((
        SELECT CAST(SUM(CASE WHEN status = 'healthy' THEN 0 ELSE 1 END) AS REAL) / COUNT(*)
        FROM agentsam_plugin_health_checks
        WHERE plugin_id = ? AND created_at >= unixepoch() - 86400
      ), 0),
      last_error_code=?, last_error_message=?, updated_at=unixepoch()
    WHERE id=? AND account_id=?
  `).bind(
    value.status, completedAt, healthy ? 1 : 0, completedAt, healthy ? 1 : 0,
    value.latencyMs ?? null, value.latencyMs ?? null, value.latencyMs ?? null, value.pluginId,
    value.errorCode || null, value.errorMessage || null,
    value.pluginId, value.accountId,
  ).run();
  return { id: checkId, status: value.status };
}

export async function recordToolCall(db, value = {}) {
  const callId = clean(value.id) || id('atcl');
  await db.prepare(`
    INSERT INTO agentsam_tool_call_log (
      id, account_id, agent_run_id, conversation_id, call_index, tool_key, status, duration_ms,
      error_code, failure_origin, cost_usd, input_tokens, output_tokens, cost_basis, source_client,
      cache_hit, external_execution, result_source, created_at_unix, cache_eligible
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), ?)
  `).bind(
    callId, value.accountId, value.agentRunId || null, value.conversationId || null, value.callIndex ?? null,
    value.toolKey, value.status, Math.max(0, Number(value.durationMs || 0)), value.errorCode || '', value.failureOrigin || null,
    Math.max(0, Number(value.costUsd || 0)), Math.max(0, Number(value.inputTokens || 0)), Math.max(0, Number(value.outputTokens || 0)),
    value.costBasis || 'unknown', value.sourceClient || 'agentsam-sdk', value.cacheHit ? 1 : 0, value.externalExecution === false ? 0 : 1,
    value.resultSource || 'live', value.cacheEligible ? 1 : 0,
  ).run();
  return callId;
}
