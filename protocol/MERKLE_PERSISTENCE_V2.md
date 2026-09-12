# AgentSam Merkle Persistence v2

Persistence is a host concern layered on top of the portable Merkle protocol. Version 2 hard-cuts persisted ownership to `account_id + repository_id` and removes user/workspace/tenant ownership aliases.

## Authority split

```text
root_hash       = filesystem/content authority
metadata_root   = semantic/index authority
policy_hash     = capture-scope authority
account_id      = authenticated ownership authority
repository_id   = canonical repository-registry identity
```

A checkout path, workspace, or user identity must never become `repository_id`. For registered Git repositories, the SDK may derive the canonical provider identity directly from the Git remote (for example `github:owner/repo`), matching the `code_repositories.id` convention; local repositories may fall back to the committed project manifest.

The optional searchable index table remains `agentsam_fs_merkle_snapshots`. Full manifests may be stored under the provider-neutral object prefix `agentsam_fs_merkle_snapshots/`.

Typical keys are:

```text
agentsam_fs_merkle_snapshots/<account_id>/<repository_id>/<snapshot_id>.json
```

The hosting application chooses physical storage and database bindings. The SDK never owns cloud credentials and never invents account or repository authority.

## CLI publication

```sh
agentsam login
agentsam merkle snapshot . --semantic --out .agentsam/merkle.json
agentsam merkle persist .agentsam/merkle.json \
  --wrangler-config path/to/wrangler.toml \
  --capture-kind deploy \
  --deployment-id "$DEPLOYMENT_ID"
```

The CLI reads `account_id` from the authenticated local AgentSam session and resolves `repository_id` from Git/provider identity, with the committed project manifest as fallback for local repositories. Programmatic hosts still pass authenticated `account_id + repository_id` directly to `buildMerklePersistencePlan`. For non-deploy captures, execution provenance remains required through a connection or runtime lease. `--dry-run` emits the exact storage/index plan without writes; `--r2-only` uploads the manifest without a D1 index write.

Version 1 used `owner_user_id` / `repo_id` and is superseded for current company persistence.
