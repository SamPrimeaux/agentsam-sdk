const DEFAULT_MAX_DETAIL_CHARS = 12_000;
const SECRET_KEY = /(?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret|cookie|credential|private[-_]?key)/i;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\baak_[A-Za-z0-9_-]{8,}\b/g,
  /\bsdk_[A-Za-z0-9_-]{8,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
];

function bounded(value, maxChars) {
  const text = String(value ?? '');
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function redactString(value, maxChars = DEFAULT_MAX_DETAIL_CHARS) {
  let text = bounded(value, maxChars);
  for (const pattern of SECRET_VALUE_PATTERNS) text = text.replace(pattern, '[REDACTED]');
  return text;
}

export function redactErrorValue(value, options = {}, depth = 0, key = '') {
  const maxChars = Number.isInteger(options.maxChars) && options.maxChars > 0 ? options.maxChars : DEFAULT_MAX_DETAIL_CHARS;
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (depth > 6) return '[TRUNCATED_DEPTH]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactString(value, maxChars);
  if (Array.isArray(value)) return value.slice(0, 50).map(item => redactErrorValue(item, options, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 80)) {
      out[childKey] = redactErrorValue(childValue, options, depth + 1, childKey);
    }
    return out;
  }
  return redactString(String(value), maxChars);
}

export function sanitizeNativeEvidence(native) {
  if (!native || typeof native !== 'object') return null;
  return Object.freeze({
    code: native.code == null ? null : redactString(native.code, 512),
    exception_type: native.exception_type == null ? null : redactString(native.exception_type, 512),
    exit_code: Number.isInteger(native.exit_code) ? native.exit_code : null,
    signal: native.signal == null ? null : redactString(native.signal, 128),
    stderr: native.stderr == null ? null : redactString(native.stderr, 12_000),
    stdout: native.stdout == null ? null : redactString(native.stdout, 4_000),
    stack: native.stack == null ? null : redactString(native.stack, 12_000),
  });
}
