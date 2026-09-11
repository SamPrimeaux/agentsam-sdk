import manifest from '../../protocol/capabilities/manifest.json' with { type: 'json' };

export const CAPABILITY_MANIFEST_VERSION = manifest.schema_version;

function rows() {
  return Object.values(manifest.capabilities);
}

export function listCapabilities({ domain, status = 'stable', kind } = {}) {
  return rows()
    .filter((row) => (!domain || row.domain === domain) && (!status || row.status === status) && (!kind || row.kind === kind))
    .map((row) => structuredClone(row));
}

export function getCapability(id) {
  const row = manifest.capabilities[String(id || '').trim()];
  return row ? structuredClone(row) : null;
}

export function getCapabilityManifest() {
  return structuredClone(manifest);
}
