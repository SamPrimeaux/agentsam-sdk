function clean(value) {
  return value == null ? '' : String(value).trim();
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function errorBody(error, fallback = 'acp_request_failed') {
  return {
    error: {
      code: clean(error?.code) || fallback,
      message: clean(error?.message) || fallback,
    },
  };
}

function statusForError(error) {
  const explicit = Number(error?.status || error?.statusCode);
  if (Number.isInteger(explicit) && explicit >= 400 && explicit <= 599) return explicit;
  const code = clean(error?.code);
  if (code.endsWith('_not_found') || code === 'run_not_found') return 404;
  if (code.includes('required') || code.includes('invalid') || code.startsWith('unknown_')) return 400;
  if (code.includes('terminal') || code.includes('already_')) return 409;
  if (code === 'unauthorized') return 401;
  if (code === 'forbidden') return 403;
  return 500;
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      const error = new TypeError('request_body_must_be_object');
      error.code = 'input_invalid';
      throw error;
    }
    return body;
  } catch (error) {
    if (error?.code === 'input_invalid') throw error;
    const wrapped = new TypeError('invalid_json_body');
    wrapped.code = 'input_invalid';
    throw wrapped;
  }
}

function segments(pathname) {
  return pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
}

function requireMethod(request, allowed) {
  if (allowed.includes(request.method)) return;
  const error = new Error('method_not_allowed');
  error.code = 'method_not_allowed';
  error.status = 405;
  error.allowed = allowed;
  throw error;
}

function ensureControl(control) {
  if (!control || typeof control !== 'object') throw new TypeError('control adapter is required');
  for (const method of ['start', 'getRun', 'events', 'tree', 'spawn', 'cancel', 'receipt']) {
    if (typeof control[method] !== 'function') throw new TypeError(`control.${method}() is required`);
  }
  return control;
}

/**
 * Provider-neutral AgentSam Agent Control Plane HTTP contract.
 *
 * The request router contains no Cloudflare/GCP/Docker/VM assumptions. A host
 * supplies a control adapter backed by its chosen persistence/queue/runtime
 * implementation and may supply authorization separately.
 */
export function createAgentControlHttpHandler({
  control,
  authorize = null,
  service = 'agentsam-control-plane',
} = {}) {
  const adapter = ensureControl(control);

  return async function handleAgentControlRequest(request, context = {}) {
    try {
      if (!(request instanceof Request)) throw new TypeError('Request is required');

      if (typeof authorize === 'function') {
        const auth = await authorize(request, context);
        if (auth === false || auth?.ok === false) {
          const error = new Error(auth?.message || 'unauthorized');
          error.code = auth?.code || 'unauthorized';
          error.status = auth?.status || 401;
          throw error;
        }
      }

      const url = new URL(request.url);
      const parts = segments(url.pathname);

      if (url.pathname === '/health' || url.pathname === '/v1/health') {
        requireMethod(request, ['GET']);
        return json({
          ok: true,
          service,
          protocol: 'agentsam.control.v1',
        });
      }

      if (parts[0] !== 'v1' || parts[1] !== 'runs') {
        return json(errorBody(Object.assign(new Error('route_not_found'), { code: 'route_not_found' })), 404);
      }

      // POST /v1/runs
      if (parts.length === 2) {
        requireMethod(request, ['POST']);
        return json(await adapter.start(await readJson(request)), 202);
      }

      const runId = clean(parts[2]);
      if (!runId) {
        const error = new Error('run_id_required');
        error.code = 'run_id_required';
        throw error;
      }

      // GET /v1/runs/:id
      if (parts.length === 3) {
        requireMethod(request, ['GET']);
        const run = await adapter.getRun(runId);
        if (!run) {
          const error = new Error(`run_not_found:${runId}`);
          error.code = 'run_not_found';
          throw error;
        }
        return json(run);
      }

      const action = parts[3];
      if (parts.length !== 4) {
        return json(errorBody(Object.assign(new Error('route_not_found'), { code: 'route_not_found' })), 404);
      }

      if (action === 'events') {
        requireMethod(request, ['GET']);
        const after = Number(url.searchParams.get('after') ?? -1);
        const limit = Number(url.searchParams.get('limit') ?? 200);
        return json(await adapter.events(runId, {
          after: Number.isFinite(after) ? after : -1,
          limit: Number.isFinite(limit) ? limit : 200,
        }));
      }

      if (action === 'tree') {
        requireMethod(request, ['GET']);
        const tree = await adapter.tree(runId);
        if (!tree) {
          const error = new Error(`run_not_found:${runId}`);
          error.code = 'run_not_found';
          throw error;
        }
        return json(tree);
      }

      if (action === 'spawn') {
        requireMethod(request, ['POST']);
        return json(await adapter.spawn(runId, await readJson(request)), 202);
      }

      if (action === 'cancel') {
        requireMethod(request, ['POST']);
        const run = await adapter.cancel(runId);
        if (!run) {
          const error = new Error(`run_not_found:${runId}`);
          error.code = 'run_not_found';
          throw error;
        }
        return json(run, 202);
      }

      if (action === 'receipt') {
        requireMethod(request, ['GET']);
        const receipt = await adapter.receipt(runId);
        if (!receipt) {
          const error = new Error(`run_not_found:${runId}`);
          error.code = 'run_not_found';
          throw error;
        }
        return json(receipt);
      }

      return json(errorBody(Object.assign(new Error('route_not_found'), { code: 'route_not_found' })), 404);
    } catch (error) {
      const status = statusForError(error);
      const headers = status === 405 && Array.isArray(error?.allowed)
        ? { allow: error.allowed.join(', ') }
        : {};
      return json(errorBody(error), status, headers);
    }
  };
}
