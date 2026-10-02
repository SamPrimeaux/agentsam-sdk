import { LOCAL_ENGINE_BENCHMARK_SCHEMA } from './contracts.js';

function tokenCount(result) { return Number(result?.usage?.output_tokens || result?.usage?.completion_tokens || String(result?.output_text || '').trim().split(/\s+/).filter(Boolean).length); }
function validateShape(value, schema) {
  if (!schema || typeof schema !== 'object') return { valid: true, error: null };
  if (schema.type === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value))) return { valid: false, error: 'expected_object' };
  if (schema.type === 'array' && !Array.isArray(value)) return { valid: false, error: 'expected_array' };
  if (schema.required) for (const key of schema.required) if (!(key in value)) return { valid: false, error: `missing_required:${key}` };
  if (schema.properties && value && typeof value === 'object') for (const [key, child] of Object.entries(schema.properties)) if (key in value) { const result = validateShape(value[key], child); if (!result.valid) return { valid: false, error: `${key}.${result.error}` }; }
  return { valid: true, error: null };
}
export function validateStructuredOutput(text, schema = null) {
  try { const value = JSON.parse(String(text || '')); const shape = validateShape(value, schema); return { valid: shape.valid, parse_error: null, schema_error: shape.valid ? null : shape.error, value: shape.valid ? value : null, grammar_enforced: false, tool_arguments_valid: shape.valid }; } catch (error) { return { valid: false, parse_error: error.message, schema_error: null, value: null, grammar_enforced: false, tool_arguments_valid: false }; }
}
export async function benchmarkEngine(engine, options = {}) {
  const runs = Math.max(1, Number(options.runs) || 1); const prompt = options.prompt || 'Reply with a short JSON object containing an answer field.'; const results = [];
  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    const result = await engine.chat({ model: options.model, messages: [{ role: 'user', content: prompt }], responseFormat: options.schema ? { type: 'json_object' } : null });
    const ended = performance.now(); const outputTokens = tokenCount(result); const ttft = Number.isFinite(result?.timing?.ttft_ms) ? result.timing.ttft_ms : null; const elapsed = ended - started;
    results.push({ run: i + 1, ttft_ms: ttft, elapsed_ms: elapsed, output_tokens: outputTokens, tokens_per_second: elapsed > 0 ? outputTokens / (elapsed / 1000) : null, structured_output: options.schema ? validateStructuredOutput(result.output_text, options.schema) : null });
  }
  return { schema_version: LOCAL_ENGINE_BENCHMARK_SCHEMA, engine_id: engine.id, model: options.model || null, generated_at: new Date().toISOString(), fixture: { id: options.fixtureId || 'default-json', prompt_hash: cryptoHash(prompt) }, runs: results, summary: summarize(results), resource: { memory: null, source: 'not_available' }, warnings: ['Memory utilization requires an engine/platform sampler.', 'TTFT is null unless the engine adapter reports a measured first-token time.'] };
}
function cryptoHash(value) { let h = 2166136261; for (const char of String(value)) h = Math.imul(h ^ char.charCodeAt(0), 16777619); return (h >>> 0).toString(16); }
function summarize(rows) { const average = (key) => { const values = rows.map((row) => row[key]).filter((x) => Number.isFinite(x)); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }; return { average_ttft_ms: average('ttft_ms'), average_tokens_per_second: average('tokens_per_second'), valid_structured_outputs: rows.filter((row) => row.structured_output?.valid === true).length, run_count: rows.length }; }
