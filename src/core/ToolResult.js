export function createTrace(meta = {}) {
  const startedAt = meta.startedAt || new Date().toISOString();
  return {
    runtime: meta.runtime || 'local',
    startedAt,
  };
}

export function finishTrace(trace = {}) {
  const finishedAt = new Date().toISOString();
  const startedMs = Date.parse(trace.startedAt || finishedAt);
  const finishedMs = Date.parse(finishedAt);
  return {
    runtime: trace.runtime || 'local',
    startedAt: trace.startedAt || finishedAt,
    finishedAt,
    durationMs: Number.isFinite(startedMs) ? Math.max(0, finishedMs - startedMs) : 0,
  };
}

export function okResult(tool, data = {}, trace = {}) {
  return {
    ok: true,
    tool,
    data,
    trace: finishTrace(trace),
  };
}

export function errorResult(tool, code, message, details = undefined, trace = {}) {
  return {
    ok: false,
    tool,
    error: {
      code: String(code || 'tool_error'),
      message: String(message || 'Tool failed'),
      ...(details === undefined ? {} : { details }),
    },
    trace: finishTrace(trace),
  };
}
