import { resolveOllamaConfig, probeOllama, probeOllamaModel } from '../commands/ollama.js';
import { createOllamaChatAdapter } from '../providers/ollama-chat.js';
import { capabilityCard, engineInventory, engineError, normalizeChatResult, normalizeEmbedResult } from './contracts.js';
import { executable, fetchJson, runCommand, unsupported } from './runtime.js';

function modelNames(body) {
  return Array.isArray(body?.models) ? body.models.map((row) => ({ name: row.name || row.model || '', size: row.size || null, digest: row.digest || null })).filter((row) => row.name) : [];
}

export function createOllamaEngine(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const config = resolveOllamaConfig(options, env);
  return {
    id: 'ollama',
    async discover() {
      const api = await probeOllama(config, fetchImpl);
      const binary = runCommand('ollama', ['--version'], { env });
      return engineInventory({
        engineId: 'ollama', version: binary.ok ? String(binary.stdout || binary.stderr).trim() : null,
        installed: binary.installed, reachable: api.online, endpoint: config.baseUrl,
        models: api.models || [],
        capabilities: { chat: api.chat_ready, embed: api.embed_ready, 'chat.streaming': true, 'chat.tools': true, 'model.unload': true },
        evidence: [{ source: 'ollama', endpoint: config.baseUrl, status: api.status }],
        warnings: api.error ? [api.error] : [],
      });
    },
    async capabilities({ model } = {}) {
      const probe = await probeOllamaModel(model || config.model, config, fetchImpl);
      return capabilityCard({ engineId: 'ollama', model: model || config.model, status: probe.ok ? 'available' : 'unavailable', capabilities: {
        chat: probe.ok, 'chat.streaming': true, 'chat.tools': probe.capabilities?.includes('tools') === true,
        embed: false, 'output.json': true, 'output.json_schema': false, 'model.unload': true, 'metrics.ttft': true,
      }, evidence: [{ source: 'ollama/api/show', context_window: probe.context_window, capabilities: probe.capabilities || [] }], warnings: probe.error ? [probe.error] : [] });
    },
    async chat(params = {}) {
      const adapter = createOllamaChatAdapter({ endpoint: config.baseUrl, env, fetchImpl });
      const result = await adapter.create({ ...params, modelRecord: { provider: 'ollama', provider_model_id: params.model || config.model, context_window: params.context_window || 0 } });
      return normalizeChatResult({ ...result, timing: result.timing || {} }, 'ollama');
    },
    async embed({ model = config.embedModel, inputs = [] } = {}) {
      const values = Array.isArray(inputs) ? inputs : [inputs];
      const response = await fetchJson(`${config.baseUrl}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input: values }) }, fetchImpl);
      if (!response.ok) throw engineError('LOCAL_ENGINE_EMBED_FAILED', response.error || 'Ollama embedding failed', { engine_id: 'ollama' });
      const embeddings = response.body?.embeddings || (response.body?.embedding ? [response.body.embedding] : []);
      return normalizeEmbedResult({ model, embeddings, dimensions: embeddings[0]?.length || 0 }, 'ollama');
    },
    async unload({ model } = {}) {
      const response = await fetchJson(`${config.baseUrl}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: model || config.model, prompt: '', keep_alive: 0 }) }, fetchImpl);
      return { schema_version: 'agentsam.local-engine.v1', engine_id: 'ollama', model: model || config.model, unloaded: response.ok, status: response.ok ? 'completed' : 'unavailable', error: response.error || null };
    },
  };
}

function openAiEndpoint(options, defaultUrl) { return String(options.endpoint || process.env[options.envKey || 'AGENTSAM_LOCAL_ENGINE_ENDPOINT'] || defaultUrl).replace(/\/$/, ''); }

function createOpenAiCompatibleEngine({ id, endpoint, command, args, env = process.env, capabilities = {}, options = {} }) {
  const fetchImpl = options.fetchImpl || fetch;
  return {
    id,
    async discover() {
      const binary = runCommand(command, ['--version'], { env });
      const health = await fetchJson(`${endpoint}/v1/models`, {}, fetchImpl);
      return engineInventory({ engineId: id, version: binary.ok ? String(binary.stdout || binary.stderr).trim() : null, installed: binary.installed, reachable: health.ok, endpoint, models: modelNames(health.body?.data ? { models: health.body.data.map((row) => ({ name: row.id })) } : health.body), capabilities, evidence: [{ source: 'openai-compatible', endpoint }], warnings: health.error ? [health.error] : [] });
    },
    async capabilities({ model = null } = {}) { return capabilityCard({ engineId: id, model, status: 'unknown', capabilities, evidence: [{ source: 'adapter declaration', endpoint }], warnings: ['Model-specific capabilities require a live probe.'] }); },
    async chat({ model, messages = [], tools = [], responseFormat = null, onEvent, signal } = {}) {
      const started = performance.now();
      const response = await fetchJson(`${endpoint}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages, tools: tools.length ? tools : undefined, response_format: responseFormat || undefined, stream: false }), signal }, fetchImpl);
      if (!response.ok) throw engineError('LOCAL_ENGINE_CHAT_FAILED', response.error || `${id} chat failed`, { engine_id: id });
      const choice = response.body?.choices?.[0] || {};
      const text = choice.message?.content || '';
      onEvent?.({ type: 'token', text, timestamp_ms: performance.now() });
      return normalizeChatResult({ model, output_text: text, tool_calls: choice.message?.tool_calls || [], usage: response.body?.usage || {}, timing: { elapsed_ms: performance.now() - started, ttft_ms: performance.now() - started } }, id);
    },
    async embed({ model, inputs = [], signal } = {}) {
      const response = await fetchJson(`${endpoint}/v1/embeddings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input: inputs }), signal }, fetchImpl);
      if (!response.ok) throw engineError('LOCAL_ENGINE_EMBED_FAILED', response.error || `${id} embedding failed`, { engine_id: id });
      const embeddings = (response.body?.data || []).sort((a, b) => a.index - b.index).map((row) => row.embedding);
      return normalizeEmbedResult({ model, embeddings, dimensions: embeddings[0]?.length || 0, usage: response.body?.usage || {} }, id);
    },
    async unload({ model, signal } = {}) { return { schema_version: 'agentsam.local-engine.v1', engine_id: id, model, unloaded: false, status: 'unsupported', error: unsupported(id, 'unload').message, signal: Boolean(signal) }; },
  };
}

export function createMlxLmEngine(options = {}) {
  const endpoint = openAiEndpoint(options, 'http://127.0.0.1:8080');
  return createOpenAiCompatibleEngine({ id: 'mlx-lm', endpoint, command: options.command || 'python3', args: [], env: options.env || process.env, capabilities: { chat: true, 'chat.streaming': true, embed: false, 'runtime.mlx': true, 'runtime.metal': true, 'output.json': true }, options });
}

export function createLlamaCppEngine(options = {}) {
  const endpoint = openAiEndpoint(options, 'http://127.0.0.1:8080');
  return createOpenAiCompatibleEngine({ id: 'llama.cpp', endpoint, command: options.command || 'llama-server', args: [], env: options.env || process.env, capabilities: { chat: true, 'chat.streaming': true, 'chat.tools': true, embed: true, 'format.gguf': true, 'runtime.metal': true, 'output.grammar': true, 'output.json_schema': true, 'model.unload': false }, options });
}

export function defaultLocalEngines(options = {}) { return [createOllamaEngine(options), createMlxLmEngine(options.mlx || options), createLlamaCppEngine(options.llamaCpp || options)]; }
