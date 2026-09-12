export const REPOSITORY_STATUSES = ['active', 'archived', 'disabled'] as const;
export type RepositoryStatus = (typeof REPOSITORY_STATUSES)[number];

export const REPOSITORY_CONTRACT_TYPES = ['api', 'schema', 'runtime', 'cli', 'event', 'receipt', 'package'] as const;
export type RepositoryContractType = (typeof REPOSITORY_CONTRACT_TYPES)[number];

export const REPOSITORY_CONTRACT_STATUSES = ['active', 'deprecated', 'retired'] as const;
export type RepositoryContractStatus = (typeof REPOSITORY_CONTRACT_STATUSES)[number];

export const REPOSITORY_DEPENDENCY_TYPES = ['runtime', 'build', 'contract', 'package', 'deploy', 'tool', 'data'] as const;
export type RepositoryDependencyType = (typeof REPOSITORY_DEPENDENCY_TYPES)[number];

export const REPOSITORY_DEPENDENCY_CRITICALITIES = ['informational', 'compatible', 'strict', 'critical'] as const;
export type RepositoryDependencyCriticality = (typeof REPOSITORY_DEPENDENCY_CRITICALITIES)[number];

export const REPOSITORY_FAILURE_POLICIES = ['warn', 'block_certification', 'block_deploy', 'degrade'] as const;
export type RepositoryFailurePolicy = (typeof REPOSITORY_FAILURE_POLICIES)[number];

/** Portable repository identity. Account ownership belongs to the host registry, not this object. */
export interface RepositoryIdentity {
  schema_version: 1;
  repository_id: string;
  full_name: string;
  role: string;
  default_branch: string;
  canonical_url: string | null;
  status: RepositoryStatus;
}

/** Account-bound declaration of one contract provided by a repository. */
export interface RepositoryContract {
  schema_version: 1;
  id: string;
  account_id: string;
  repository_id: string;
  contract_key: string;
  contract_version: string;
  contract_type: RepositoryContractType;
  name: string;
  description: string | null;
  manifest_path: string | null;
  contract_hash: string;
  status: RepositoryContractStatus;
  created_at: number | null;
  updated_at: number | null;
}

/** Account-bound cross-repository dependency edge. */
export interface RepositoryDependency {
  schema_version: 1;
  id: string;
  account_id: string;
  source_repository_id: string;
  target_repository_id: string;
  dependency_type: RepositoryDependencyType;
  contract_id: string | null;
  criticality: RepositoryDependencyCriticality;
  required_version: string | null;
  required_contract_hash: string | null;
  failure_policy: RepositoryFailurePolicy;
  description: string | null;
  created_at: number | null;
  updated_at: number | null;
}
