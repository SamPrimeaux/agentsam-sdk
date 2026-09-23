const ALWAYS_SENSITIVE_KEY = /^(authorization|proxy-authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|credential|credentials)$/i;
const REDACTED = '[REDACTED]';

function cloneAndRedactSecrets(value, seen = new WeakSet()) {
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => cloneAndRedactSecrets(item, seen));
  }

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = ALWAYS_SENSITIVE_KEY.test(key)
      ? REDACTED
      : cloneAndRedactSecrets(child, seen);
  }
  return output;
}

function redactMatchingKey(value, keyName) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) redactMatchingKey(item, keyName);
    return;
  }
  for (const key of Object.keys(value)) {
    if (key === keyName) value[key] = REDACTED;
    else redactMatchingKey(value[key], keyName);
  }
}

function redactPath(value, path) {
  const parts = String(path || '').split('.').map((part) => part.trim()).filter(Boolean);
  if (!parts.length || !value || typeof value !== 'object') return;

  if (parts.length === 1) {
    redactMatchingKey(value, parts[0]);
    return;
  }

  let current = value;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (!current || typeof current !== 'object') return;
    current = current[parts[index]];
  }
  if (current && typeof current === 'object' && Object.hasOwn(current, parts.at(-1))) {
    current[parts.at(-1)] = REDACTED;
  }
}

export function redactToolValue(value, sensitivePaths = []) {
  const safe = cloneAndRedactSecrets(value);
  for (const path of sensitivePaths || []) redactPath(safe, path);
  return safe;
}

export function receiptPayload(value, { mode = 'full', sensitivePaths = [] } = {}) {
  if (mode === 'metadata_only') return undefined;
  return redactToolValue(value, mode === 'redacted' ? sensitivePaths : []);
}

export { REDACTED as AGENTSAM_REDACTED_VALUE };
