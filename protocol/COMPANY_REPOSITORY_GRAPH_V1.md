# AgentSam Company Repository Graph v1

This protocol defines the portable vocabulary for company-wide repository identity, public contracts, dependency edges, and Merkle evidence. It does not make the SDK a global database.

## Authority split

- `agentsam-sdk` defines schemas, enums, builders, Merkle formats, and receipt semantics.
- The authenticated host owns `account_id` and persists the operational graph.
- `code_repositories` is the canonical repository registry.
- `agentsam_repository_contracts` records what a repository provides.
- `agentsam_repository_dependencies` records what a repository consumes and the policy attached to that edge.
- `agentsam_fs_merkle_snapshots` indexes exact repository states; full manifests may live in object storage.
- Deployment and deployment-health tables record whether a source state reached production and whether it remains healthy.
- MCP may expose graph queries; ExecOS may emit execution evidence. Neither becomes the ownership authority.

## Ownership law

Persisted company graph records use `account_id` as ownership SSOT. `tenant_id`, `workspace_id`, `user_id`, and `owner_user_id` are not part of this protocol.

Portable repository identity is deliberately different: a checked-in repository identity must not embed an account identifier. The host binds its stable `repository_id` to an authenticated `account_id` in the registry.

## Canonical repository identity

A Git remote is evidence, not authority. The SDK must not derive the canonical `repository_id` from `owner/repo`, a checkout path, a workspace, or a provider URL. Persistence callers provide the `repository_id` from the host registry.

## Graph levels

```text
code_repositories
  repository identity / company role
        |
        +-- agentsam_repository_contracts
        |     what this repository provides
        |
        +-- agentsam_repository_dependencies
              what this repository consumes
                    |
                    +-- Merkle / AST / Git evidence
                    |
                    +-- deployments / deployment health
```

`codebase_dep_edges` remains an intra-repository code graph. `agentsam_repository_dependencies` is a cross-repository company graph. They are not interchangeable.

## Contract records

Contract types are:

`api | schema | runtime | cli | event | receipt | package`

Statuses are:

`active | deprecated | retired`

A contract record carries a stable `contract_key`, explicit version, manifest path when one exists, and `contract_hash`. The hash is the semantic identity consumers can pin independently of a Git branch name.

## Dependency records

Dependency types are:

`runtime | build | contract | package | deploy | tool | data`

Criticality is:

`informational | compatible | strict | critical`

Failure policy is:

`warn | block_certification | block_deploy | degrade`

The dependency graph supplies the meaning a Merkle tree cannot infer by itself: who consumes a changed contract and what should happen if the requirement is violated.

## Merkle persistence v2

Company persistence uses:

```text
account_id + repository_id + snapshot_id
```

Object keys are:

```text
agentsam_fs_merkle_snapshots/<account_id>/<repository_id>/<snapshot_id>.json
```

The content root, metadata root, and policy hash remain separate authorities. A future contract/dependency aggregate root may be layered above these records without changing the content Merkle format.

## Certification

Version 1 intentionally does not require a separate certifications table. A host can derive an initial certification decision from repository identity, contract hashes, dependency requirements, Merkle roots, verification results, deployments, and deployment health. A persistent certification ledger can be added when there is a real need to preserve compatibility statements across an exact set of repository roots.
