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
agentsam merkle snapshot . --semantic --out .agentsam/merkle.json
agentsam merkle persist .agentsam/merkle.json \
  --wrangler-config path/to/wrangler.toml \
  --account-id "$AGENTSAM_ACCOUNT_ID" \
  --repository-id "$AGENTSAM_REPOSITORY_ID" \
  --capture-kind deploy \
  --deployment-id "$DEPLOYMENT_ID"
```

`--account-id` and `--repository-id` are required by the persistence plan. For non-deploy captures, execution provenance remains required through a connection or runtime lease. `--dry-run` emits the exact storage/index plan without writes; `--r2-only` uploads the manifest without a D1 index write.

Version 1 used `owner_user_id` / `repo_id` and is superseded for current company persistence.
