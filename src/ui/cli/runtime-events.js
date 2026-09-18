import { renderPlanUpdate } from './plan.js';
import { renderWaitingInput } from './waiting.js';
import { renderCompactionReceipt } from './compaction.js';

function line(write, text) {
  if (text) write(text.endsWith('\n') ? text : text + '\n');
}

export function createCliRuntimePresenter(options = {}) {
  const activity = options.activity;
  const write = options.write || process.stdout.write.bind(process.stdout);
  const state = options.state || {};

  function handle(event = {}) {
    const type = String(event.type || '');
    const payload = event.payload || {};
    if (!type) return;

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
