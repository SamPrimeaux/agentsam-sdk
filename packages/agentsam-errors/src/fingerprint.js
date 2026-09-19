function clean(value) { return value == null ? '' : String(value).trim(); }

function stableFields(value = {}) {
  return [
    value.code,
    value.reason,
    value.severity,
    value.source?.kind,
    value.source?.name,
    value.source?.service,
    value.resolution_owner,
    value.domain,
    value.tool,
    value.stage,
    value.provider,
    value.provider_code,
    value.native?.code,
    value.native?.exception_type,
    value.environment?.component,
    value.environment?.runtime,
  ].map(clean).join('\u001f');
}

// FNV-1a 64-bit: deterministic, dependency-free, Worker/Node safe. This is an
// operational grouping key, not a cryptographic integrity primitive.
export function fingerprintError(value = {}) {
  const text = stableFields(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `err_${hash.toString(16).padStart(16, '0')}`;
}
