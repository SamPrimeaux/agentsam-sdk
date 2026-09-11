# `agentsam-sdk` Cloudflare Worker

The canonical SDK service is the Cloudflare Worker named `agentsam-sdk`. It is separate from Local Studio / Workmode. The root `wrangler.toml` is the deployment SSOT for the SDK Worker.

## Binding contract

```text
agentsam-sdk
├─ DB              -> D1
├─ WEBSITE_ASSETS  -> R2
├─ IAM_ORIGIN      -> public runtime variable
├─ IAM_CLIENT_ID   -> public runtime variable, registration-specific
├─ IAM_CLIENT_SECRET -> secret
├─ AGENTSAM_SDK_KEY  -> secret
└─ AGENTSAM_BRIDGE_KEY -> secret
```

For the Inner Animal Media SDK deployment the physical resources are:

```text
DB             = inneranimalmedia-business
WEBSITE_ASSETS = agentsam-os-blueprint-content
IAM_ORIGIN     = https://inneranimalmedia.com
```

`IAM_CLIENT_ID` is public by OAuth design, but it must come from the OAuth registration for this Worker. Do not borrow another application's client id. `IAM_CLIENT_SECRET`, `AGENTSAM_SDK_KEY`, and `AGENTSAM_BRIDGE_KEY` belong in Cloudflare secret storage and must never be committed.

The migration aliases `IAM_OAUTH_ISSUER` and `AGENTSAM_SDK_TOKEN` remain read-compatible inside SDK 2.5 for existing consumers, but they are not part of new Worker configuration.

## Secrets

Install the three server-side values without printing them:

```sh
printf '%s' "$IAM_CLIENT_SECRET" | wrangler secret put IAM_CLIENT_SECRET --name agentsam-sdk
printf '%s' "$AGENTSAM_SDK_KEY" | wrangler secret put AGENTSAM_SDK_KEY --name agentsam-sdk
printf '%s' "$AGENTSAM_BRIDGE_KEY" | wrangler secret put AGENTSAM_BRIDGE_KEY --name agentsam-sdk
```

After an SDK OAuth client is minted, add its public `IAM_CLIENT_ID` as a production runtime variable. `keep_vars = true` in the root Wrangler config prevents an installation-specific dashboard variable from being erased by normal repo-owned deploys.

## Merkle persistence

The SDK Worker owns the development deployment binding for semantic snapshots:

```text
WEBSITE_ASSETS/agentsam_fs_merkle_snapshots/
```

The physical bucket is installation-specific. Customer/generated Workers keep the logical binding name `WEBSITE_ASSETS` and can point it at their own selected R2 bucket. The searchable row contract remains `agentsam_fs_merkle_snapshots`; R2 stores the full snapshot document.

The three identities remain independent:

```text
root_hash      = content identity
policy_hash    = capture-scope identity
metadata_root  = semantic/index identity
```
