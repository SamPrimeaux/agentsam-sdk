export const OLLAMA_DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function normalizeOllamaEndpoint(value = OLLAMA_DEFAULT_ENDPOINT) {
  let raw = clean(value) || OLLAMA_DEFAULT_ENDPOINT;
  if (!raw.includes('://')) raw = 'http://' + raw;

  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('ollama_endpoint_protocol_invalid:' + url.protocol);
  }

  if (url.hostname === '0.0.0.0') url.hostname = '127.0.0.1';

  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  const normalized = url.toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

export function resolveOllamaEndpoint({ endpoint, env = process.env } = {}) {
  return normalizeOllamaEndpoint(
    endpoint
      || env.AGENTSAM_OLLAMA_ENDPOINT
      || env.OLLAMA_BASE_URL
      || env.OLLAMA_HOST
      || OLLAMA_DEFAULT_ENDPOINT,
  );
}
