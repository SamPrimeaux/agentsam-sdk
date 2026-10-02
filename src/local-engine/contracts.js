import { createToolError, ERROR_CODE, ERROR_REASON } from '@inneranimalmedia/agentsam-errors';

export const LOCAL_ENGINE_SCHEMA = 'agentsam.local-engine.v1';
export const LOCAL_ENGINE_BENCHMARK_SCHEMA = 'agentsam.engine.benchmark.v1';

export const ENGINE_CAPABILITIES = Object.freeze([
  'chat', 'chat.streaming', 'chat.tools', 'embed', 'embed.batch',
  'output.json', 'output.json_schema', 'output.grammar', 'model.load',
  'model.unload', 'metrics.ttft', 'metrics.tokens_per_second', 'metrics.memory',
  'runtime.metal', 'runtime.mlx', 'format.gguf', 'format.safetensors',
]);

export const ENGINE_STATUS = Object.freeze(['installed', 'available', 'unavailable', 'unknown']);

export function clean(value) { return value == null ? '' : String(value).trim(); }

export function normalizeCapability(value) {
  const id = clean(value).toLowerCase();
  return ENGINE_CAPABILITIES.includes(id) ? id : null;
}

export function capabilityCard({ engineId, version = null, model = null, capabilities = {}, evidence = [], status = 'unknown', warnings = [] } = {}) {
  if (!engineId) throw new TypeError('engineId is required');
  const normalized = Object.fromEntries(ENGINE_CAPABILITIES.map((id) => [id, capabilities[id] === true]));
  return Object.freeze({
    schema_version: LOCAL_ENGINE_SCHEMA,
    engine_id: clean(engineId),
    version: version || null,
    model: model || null,
    status: ENGINE_STATUS.includes(status) ? status : 'unknown',
    capabilities: Object.freeze(normalized),
    evidence: Object.freeze(Array.isArray(evidence) ? evidence.map((row) => ({ ...row })) : []),
    warnings: Object.freeze(Array.isArray(warnings) ? [...warnings] : []),
  });
}

export function engineInventory({ engineId, version = null, installed = false, reachable = false, endpoint = null, models = [], capabilities = {}, evidence = [], warnings = [] } = {}) {
  return Object.freeze({
    schema_version: LOCAL_ENGINE_SCHEMA,
    engine_id: clean(engineId),
    version: version || null,
    installed: installed === true,
    reachable: reachable === true,
    endpoint: endpoint || null,
    models: Object.freeze((Array.isArray(models) ? models : []).map((row) => ({ ...row }))),
    capabilities: Object.freeze({ ...capabilities }),
    evidence: Object.freeze(Array.isArray(evidence) ? evidence.map((row) => ({ ...row })) : []),
    warnings: Object.freeze(Array.isArray(warnings) ? [...warnings] : []),
  });
}

export function engineError(localCode, message, details = {}) {
  const unsupported = localCode === 'LOCAL_ENGINE_UNSUPPORTED';
  const engineId = details.engine_id || details.engineId || 'unknown';
  return createToolError({
    tool: `local-engine.${engineId}`,
    domain: 'runtime',
    stage: details.operation || 'execute',
    code: unsupported ? ERROR_CODE.UNIMPLEMENTED : ERROR_CODE.UNAVAILABLE,
    reason: unsupported ? ERROR_REASON.UNSUPPORTED_OPERATION : ERROR_REASON.PROVIDER_UNAVAILABLE,
    message: message || localCode,
    retryable: !unsupported,
    provider: engineId,
    native: { code: localCode },
    details: { ...details, local_code: localCode },
  });
}

export function assertEngineContract(engine) {
  for (const method of ['discover', 'capabilities', 'chat', 'embed', 'unload']) {
    if (typeof engine?.[method] !== 'function') throw new TypeError(`local engine ${method}() is required`);
  }
  return engine;
}

export function normalizeChatResult(result = {}, engineId = null) {
  return Object.freeze({
    schema_version: LOCAL_ENGINE_SCHEMA,
    engine_id: result.engine_id || engineId,
    model: result.model || null,
    status: result.status || 'completed',
    output_text: String(result.output_text || ''),
    tool_calls: Object.freeze(Array.isArray(result.tool_calls) ? result.tool_calls.map((row) => ({ ...row })) : []),
    usage: Object.freeze({ ...(result.usage || {}) }),
    timing: Object.freeze({ ...(result.timing || {}) }),
    evidence: Object.freeze(Array.isArray(result.evidence) ? [...result.evidence] : []),
  });
}

export function normalizeEmbedResult(result = {}, engineId = null) {
  return Object.freeze({
    schema_version: LOCAL_ENGINE_SCHEMA,
    engine_id: result.engine_id || engineId,
    model: result.model || null,
    status: result.status || 'completed',
    embeddings: Object.freeze(Array.isArray(result.embeddings) ? result.embeddings : []),
    dimensions: Number(result.dimensions) || 0,
    usage: Object.freeze({ ...(result.usage || {}) }),
    evidence: Object.freeze(Array.isArray(result.evidence) ? [...result.evidence] : []),
  });
}
