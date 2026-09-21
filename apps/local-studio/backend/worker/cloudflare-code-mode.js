import { loadCloudflareAccessToken } from '../../../../packages/connectors/cloudflare/src/index.js';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const OPENAPI_SPEC_URL = 'https://raw.githubusercontent.com/cloudflare/api-schemas/main/openapi.json';
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
let openApiPromise;

function clean(value) {
  return value == null ? '' : String(value).trim();
}

async function loadOpenApiSpec(fetchImpl = fetch) {
  if (!openApiPromise) {
    openApiPromise = fetchImpl(OPENAPI_SPEC_URL, {
      headers: { accept: 'application/json', 'user-agent': 'agentsam-local-studio' },
      cf: { cacheEverything: true, cacheTtl: 3600 },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`cloudflare_openapi_http_${response.status}`);
      return response.json();
    }).catch((error) => {
      openApiPromise = undefined;
      throw error;
    });
  }
  return openApiPromise;
}

export async function searchCloudflareApi(query, options = {}) {
  const terms = clean(query).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) throw new Error('cloudflare_search_query_required');
  const spec = await loadOpenApiSpec(options.fetchImpl || fetch);
  const results = [];
  for (const [path, pathItem] of Object.entries(spec?.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem || {})) {
      if (!METHODS.has(method.toUpperCase()) || !operation || typeof operation !== 'object') continue;
      const haystack = [path, method, operation.operationId, operation.summary, operation.description, ...(operation.tags || [])]
        .filter(Boolean).join(' ').toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      if (!score) continue;
      results.push({
        method: method.toUpperCase(),
        path,
        operation_id: operation.operationId || null,
        summary: operation.summary || null,
        tags: Array.isArray(operation.tags) ? operation.tags : [],
        score,
      });
    }
  }
  results.sort((left, right) => right.score - left.score || String(left.path).localeCompare(String(right.path)));
  return { query: clean(query), total: results.length, results: results.slice(0, 20), source: OPENAPI_SPEC_URL };
}

export async function callCloudflareMcpTool(toolName, args = {}, options = {}) {
  const endpoint = clean(options.endpoint || 'https://mcp.cloudflare.com/mcp');
  const response = await (options.fetchImpl || fetch)(endpoint, {
    method: 'POST',
    headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `agentsam-${Date.now()}`,
      method: 'tools/call',
      params: { name: clean(toolName), arguments: args },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error || payload?.result?.isError) {
    const message = payload?.error?.message || `cloudflare_mcp_http_${response.status}`;
    const error = new Error(message);
    error.code = payload?.error?.code ? `cloudflare_mcp_${payload.error.code}` : 'cloudflare_mcp_call_failed';
    throw error;
  }
  return payload?.result ?? payload;
}

function buildApiUrl(requestOptions, accountId) {
  let path = clean(requestOptions?.path);
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    throw new Error('cloudflare_api_relative_path_required');
  }
  path = path.replace(/^\/client\/v4(?=\/|$)/, '');
  if (accountId) path = path.replaceAll('{account_id}', accountId).replaceAll(':account_id', accountId);
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(requestOptions?.query || {})) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, String(item)));
    else url.searchParams.set(key, String(value));
  }
  return url;
}

function cloudflareProvider(connection, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  let requestCount = 0;
  return {
    name: 'cloudflare',
    types: `declare namespace cloudflare {
  function context(): Promise<{ account_id: string | null }>;
  function request(input: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    query?: Record<string, string | number | boolean | Array<string | number>>;
    body?: unknown;
  }): Promise<{ ok: boolean; status: number; result: unknown; errors?: unknown; messages?: unknown; result_info?: unknown }>;
}`,
    tools: {
      context: {
        description: 'Return the externally supplied Cloudflare account context. No credential is exposed.',
        execute: async () => ({ account_id: connection.accountId || null }),
      },
      request: {
        description: 'Call one Cloudflare API v4 path. Authentication is injected by trusted host code.',
        execute: async (input) => {
          requestCount += 1;
          if (requestCount > 25) throw new Error('cloudflare_code_mode_request_limit');
          const method = clean(input?.method || 'GET').toUpperCase();
          if (!METHODS.has(method)) throw new Error(`cloudflare_api_method_not_allowed:${method}`);
          const response = await fetchImpl(buildApiUrl(input, connection.accountId), {
            method,
            headers: {
              authorization: `Bearer ${connection.accessToken}`,
              accept: 'application/json',
              ...(input?.body == null ? {} : { 'content-type': 'application/json' }),
            },
            body: input?.body == null || method === 'GET' ? undefined : JSON.stringify(input.body),
            signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(20_000) : undefined,
          });
          const payload = await response.json().catch(async () => ({ result: await response.text().catch(() => '') }));
          return {
            ok: response.ok && payload?.success !== false,
            status: response.status,
            result: payload?.result ?? payload,
            errors: payload?.errors,
            messages: payload?.messages,
            result_info: payload?.result_info,
          };
        },
      },
    },
  };
}

/**
 * AgentSam's provider runtime. The underlying sandbox package is an
 * implementation detail; policy, account scope, approval, and evidence stay
 * in AgentSam's plugin runtime before this function is called.
 */
export async function executeAgentSamCloudflareProgram(env, ownerId, code, options = {}) {
  const source = clean(code);
  if (!source) throw new Error('cloudflare_code_required');
  if (source.length > 24_000) throw new Error('cloudflare_code_too_large');
  if (!env?.LOADER) throw new Error('cloudflare_code_mode_loader_missing');
  const connection = await loadCloudflareAccessToken(env, ownerId);
  if (!connection) throw new Error('cloudflare_connection_missing');
  const { DynamicWorkerExecutor, resolveProvider, runCode, truncateResult } = await import('@cloudflare/codemode');
  const executor = new DynamicWorkerExecutor({ loader: env.LOADER, timeout: 45_000, globalOutbound: null });
  const outcome = await runCode({
    code: source,
    executor,
    providers: [resolveProvider(cloudflareProvider(connection, options))],
  });
  return { ...outcome, result: truncateResult(outcome.result, { maxTokens: 8_000 }) };
}
