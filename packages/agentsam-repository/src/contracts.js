export const COMPANY_REPOSITORY_GRAPH_SCHEMA_VERSION = 1;

export const REPOSITORY_STATUSES = Object.freeze(['active', 'archived', 'disabled']);
export const REPOSITORY_CONTRACT_TYPES = Object.freeze(['api', 'schema', 'runtime', 'cli', 'event', 'receipt', 'package']);
export const REPOSITORY_CONTRACT_STATUSES = Object.freeze(['active', 'deprecated', 'retired']);
export const REPOSITORY_DEPENDENCY_TYPES = Object.freeze(['runtime', 'build', 'contract', 'package', 'deploy', 'tool', 'data']);
export const REPOSITORY_DEPENDENCY_CRITICALITIES = Object.freeze(['informational', 'compatible', 'strict', 'critical']);
export const REPOSITORY_FAILURE_POLICIES = Object.freeze(['warn', 'block_certification', 'block_deploy', 'degrade']);

const LEGACY_OWNERSHIP_KEYS = Object.freeze([
  'tenant_id', 'tenantId',
  'workspace_id', 'workspaceId',
  'user_id', 'userId',
  'owner_user_id', 'ownerUserId',
]);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function required(value, label) {
  const text = clean(value);
  if (!text) throw new TypeError(`${label} is required`);
  return text;
}

function optional(value) {
  const text = clean(value);
  return text || null;
}

function enumValue(value, allowed, label) {
  const text = required(value, label).toLowerCase();
  if (!allowed.includes(text)) throw new RangeError(`unsupported ${label}: ${text}`);
  return text;
}

function optionalUnix(value, label) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new RangeError(`${label} must be a non-negative integer`);
  return number;
}

function rejectLegacyOwnership(value) {
  for (const key of LEGACY_OWNERSHIP_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      throw new TypeError(`legacy ownership field is not supported: ${key}`);
    }
  }
}

/**
 * Portable repository identity. Ownership is intentionally not embedded here;
 * the authenticated host binds repository_id to account_id in its registry.
 */
export function createRepositoryIdentity(value = {}) {
  rejectLegacyOwnership(value);
  if (Object.prototype.hasOwnProperty.call(value, 'account_id') || Object.prototype.hasOwnProperty.call(value, 'accountId')) {
    throw new TypeError('repository identity must not embed account_id');
  }
  return Object.freeze({
    schema_version: COMPANY_REPOSITORY_GRAPH_SCHEMA_VERSION,
    repository_id: required(value.repository_id ?? value.repositoryId, 'repository_id'),
    full_name: required(value.full_name ?? value.fullName, 'full_name'),
    role: required(value.role, 'role'),
    default_branch: optional(value.default_branch ?? value.defaultBranch) || 'main',
    canonical_url: optional(value.canonical_url ?? value.canonicalUrl),
    status: enumValue(value.status || 'active', REPOSITORY_STATUSES, 'repository status'),
  });
}

/** Account-bound declaration of one public repository contract. */
export function createRepositoryContract(value = {}) {
  rejectLegacyOwnership(value);
  return Object.freeze({
    schema_version: COMPANY_REPOSITORY_GRAPH_SCHEMA_VERSION,
    id: required(value.id, 'id'),
    account_id: required(value.account_id ?? value.accountId, 'account_id'),
    repository_id: required(value.repository_id ?? value.repositoryId, 'repository_id'),
    contract_key: required(value.contract_key ?? value.contractKey, 'contract_key'),
    contract_version: required(value.contract_version ?? value.contractVersion, 'contract_version'),
    contract_type: enumValue(value.contract_type ?? value.contractType, REPOSITORY_CONTRACT_TYPES, 'contract_type'),
    name: optional(value.name) || required(value.contract_key ?? value.contractKey, 'contract_key'),
    description: optional(value.description),
    manifest_path: optional(value.manifest_path ?? value.manifestPath),
    contract_hash: required(value.contract_hash ?? value.contractHash, 'contract_hash'),
    status: enumValue(value.status || 'active', REPOSITORY_CONTRACT_STATUSES, 'contract status'),
    created_at: optionalUnix(value.created_at ?? value.createdAt, 'created_at'),
    updated_at: optionalUnix(value.updated_at ?? value.updatedAt, 'updated_at'),
  });
}

/** Account-bound cross-repository dependency edge. */
export function createRepositoryDependency(value = {}) {
  rejectLegacyOwnership(value);
  return Object.freeze({
    schema_version: COMPANY_REPOSITORY_GRAPH_SCHEMA_VERSION,
    id: required(value.id, 'id'),
    account_id: required(value.account_id ?? value.accountId, 'account_id'),
    source_repository_id: required(value.source_repository_id ?? value.sourceRepositoryId, 'source_repository_id'),
    target_repository_id: required(value.target_repository_id ?? value.targetRepositoryId, 'target_repository_id'),
    dependency_type: enumValue(value.dependency_type ?? value.dependencyType, REPOSITORY_DEPENDENCY_TYPES, 'dependency_type'),
    contract_id: optional(value.contract_id ?? value.contractId),
    criticality: enumValue(value.criticality, REPOSITORY_DEPENDENCY_CRITICALITIES, 'criticality'),
    required_version: optional(value.required_version ?? value.requiredVersion),
    required_contract_hash: optional(value.required_contract_hash ?? value.requiredContractHash),
    failure_policy: enumValue(value.failure_policy ?? value.failurePolicy, REPOSITORY_FAILURE_POLICIES, 'failure_policy'),
    description: optional(value.description),
    created_at: optionalUnix(value.created_at ?? value.createdAt, 'created_at'),
    updated_at: optionalUnix(value.updated_at ?? value.updatedAt, 'updated_at'),
  });
}
