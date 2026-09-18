import { renderPlanUpdate } from './plan.js';
import { renderWaitingInput } from './waiting.js';
import { renderCompactionReceipt } from './compaction.js';

export const RUNTIME_EVENT_ENVELOPE_SCHEMA = 'agentsam-runtime-event-v1';

/**
 * Transport-neutral event contract shared by standalone and future platform-connected runs.
 * A platform SSE/WebSocket producer only needs to emit this normalized envelope; the SDK does
 * not hardcode or invent the platform endpoint that will carry it.
 */
export function normalizeRuntimeEventEnvelope(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('runtime event envelope must be an object');
  }
  const type = String(value.type || '').trim();
  if (!type) throw new TypeError('runtime event envelope type is required');
  const sequence = Number(value.sequence);
  const envelope = {
    schema: RUNTIME_EVENT_ENVELOPE_SCHEMA,
    schema_version: Number.isInteger(Number(value.schema_version)) ? Number(value.schema_version) : 1,
    type,
    timestamp: String(value.timestamp || new Date().toISOString()),
    ...(value.run_id ? { run_id: String(value.run_id) } : {}),
    ...(Number.isInteger(sequence) && sequence >= 0 ? { sequence } : {}),
    payload: value.payload && typeof value.payload === 'object' && !Array.isArray(value.payload)
      ? value.payload
      : value.payload == null ? {} : { value: value.payload },
  };
  return Object.freeze(envelope);
}

function line(write, text) {
  if (text) write(text.endsWith('\n') ? text : text + '\n');
}

export function createCliRuntimePresenter(options = {}) {
  const activity = options.activity;
  const write = options.write || process.stdout.write.bind(process.stdout);
  const state = options.state || {};

  function handle(event = {}) {
    const envelope = normalizeRuntimeEventEnvelope(event);
    const { type, payload } = envelope;

    if (type === 'usage.snapshot') {
      state.usageSnapshot = payload;
      return;
    }
    if (type === 'cost.snapshot') {
      state.costSnapshot = payload;
      return;
    }
    if (type === 'model.started') {
      activity?.update(`Thinking · ${payload.model || payload.provider || 'model'}`);
      return;
    }
    if (type === 'tool.search') {
      activity?.update('Finding relevant tools');
      return;
    }
    if (type === 'tool.started') {
      activity?.update(`Using ${payload.capability_id || payload.tool || 'tool'}`);
      return;
    }
    if (type === 'tool.completed') {
      activity?.update(`Tool complete · ${payload.capability_id || payload.tool || 'tool'}`);
      return;
    }
    if (type === 'tool.failed') {
      activity?.update(`Tool failed · ${payload.capability_id || payload.tool || 'tool'}`);
      return;
    }
    if (type === 'context.compaction.started') {
      state.compactionStartedAt = Date.now();
      activity?.update('Compacting context');
      return;
    }
    if (type === 'context.compaction.completed') {
      const enriched = {
        ...payload,
        duration_ms: payload.duration_ms ?? (state.compactionStartedAt ? Date.now() - state.compactionStartedAt : undefined),
      };
      state.lastCompaction = enriched;
      activity?.update('Context ready');
      return;
    }
    if (type === 'plan.updated') {
      activity?.clear();
      line(write, renderPlanUpdate(payload));
      activity?.start('Working');
      return;
    }
    if (type === 'runtime.waiting_input') {
      activity?.clear();
      line(write, renderWaitingInput(payload));
      return;
    }
    if (type === 'run.failed' || type === 'error.observed') {
      activity?.update('Handling error');
    }
  }

  function compactionReceipt() {
    if (!state.lastCompaction) return '';
    return renderCompactionReceipt(state.lastCompaction);
  }

  return Object.freeze({ handle, compactionReceipt, state });
}
