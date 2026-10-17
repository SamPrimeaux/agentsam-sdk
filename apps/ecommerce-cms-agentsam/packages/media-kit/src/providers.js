/**
 * Portable media provider contract.
 *
 * Storage/source, transformation, and delivery are separate roles on purpose.
 * A deployment may use only R2, only Cloudflare Images, only Google Drive, only
 * a local runtime, or a mixture (for example Drive source + CF Images transform).
 * No provider is globally mandatory.
 */

export const MEDIA_PROVIDER_ROLES = Object.freeze([
  "source",
  "transform",
  "delivery",
]);

export const MEDIA_PROVIDER_CAPABILITIES = Object.freeze([
  "list",
  "read",
  "write",
  "delete",
  "public_url",
  "signed_url",
  "transform",
  "variants",
]);

const ROLE_SET = new Set(MEDIA_PROVIDER_ROLES);
const CAPABILITY_SET = new Set(MEDIA_PROVIDER_CAPABILITIES);

function uniqueKnown(values, allowed) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter((v) => allowed.has(v)))];
}

export function normalizeMediaProviderAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("media provider adapter must be an object");
  }

  const id = String(adapter.id || "").trim();
  if (!id) throw new TypeError("media provider adapter id is required");

  const roles = uniqueKnown(adapter.roles, ROLE_SET);
  if (!roles.length) throw new TypeError(`media provider ${id} must declare at least one role`);

  const capabilities = uniqueKnown(adapter.capabilities, CAPABILITY_SET);

  return Object.freeze({
    ...adapter,
    id,
    roles: Object.freeze(roles),
    capabilities: Object.freeze(capabilities),
  });
}

export function createMediaProviderRegistry(initialAdapters = []) {
  const adapters = new Map();

  function register(adapter) {
    const normalized = normalizeMediaProviderAdapter(adapter);
    adapters.set(normalized.id, normalized);
    return normalized;
  }

  function unregister(id) {
    return adapters.delete(String(id || ""));
  }

  function get(id) {
    return adapters.get(String(id || "")) || null;
  }

  function list({ role = null, capability = null } = {}) {
    return [...adapters.values()].filter((adapter) => {
      if (role && !adapter.roles.includes(role)) return false;
      if (capability && !adapter.capabilities.includes(capability)) return false;
      return true;
    });
  }

  /**
   * Resolve one provider if available. Returning null is intentional: optional
   * capabilities (for example transforms) must not make a storage-only CMS fail.
   */
  function resolve({ id = null, role = null, capability = null } = {}) {
    if (id) {
      const adapter = get(id);
      if (!adapter) return null;
      if (role && !adapter.roles.includes(role)) return null;
      if (capability && !adapter.capabilities.includes(capability)) return null;
      return adapter;
    }
    return list({ role, capability })[0] || null;
  }

  for (const adapter of initialAdapters) register(adapter);

  return Object.freeze({
    register,
    unregister,
    get,
    list,
    resolve,
  });
}

function parseJsonObject(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Provider-neutral source descriptor exposed to UI/CMS/AgentSam.
 * Existing legacy rows can be inferred by known source fields without making any provider part of the portable
 * contract. New adapters can persist their source descriptor in meta.storage.
 */
export function mediaSourceFromRow(row = {}) {
  const meta = parseJsonObject(row.meta_json);
  const explicit = meta.storage && typeof meta.storage === "object" ? meta.storage : null;

  if (explicit?.provider) {
    return {
      provider: String(explicit.provider),
      key: explicit.key != null ? String(explicit.key) : null,
      asset_id: explicit.asset_id != null ? String(explicit.asset_id) : null,
      url: explicit.url != null ? String(explicit.url) : (row.url || null),
    };
  }

  if (row.cf_images_id) {
    return {
      provider: "cf_images",
      key: null,
      asset_id: String(row.cf_images_id),
      url: row.url || null,
    };
  }

  if (row.google_drive_file_id) {
    return {
      provider: "google_drive",
      key: null,
      asset_id: String(row.google_drive_file_id),
      url: row.url || null,
    };
  }

  if (row.local_path) {
    return {
      provider: "local",
      key: String(row.local_path),
      asset_id: null,
      url: row.url || null,
    };
  }

  if (row.r2_key) {
    return {
      provider: "r2",
      key: String(row.r2_key),
      asset_id: null,
      url: row.url || null,
    };
  }

  return {
    provider: "external",
    key: null,
    asset_id: null,
    url: row.url || null,
  };
}
