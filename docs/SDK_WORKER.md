# `agentsam-sdk` Cloudflare Worker

The canonical SDK service is the Cloudflare Worker named `agentsam-sdk`. It is separate from Local Studio / Workmode. The root `wrangler.jsonc` is the deployment SSOT for the SDK Worker.

## Binding contract

```text
agentsam-sdk
├─ DB                 -> D1
├─ WEBSITE_ASSETS     -> R2
├─ AGENTSAM_WAI       -> optional Workers AI capability
├─ IAM_ORIGIN         -> public runtime variable
├─ IAM_CLIENT_ID      -> public runtime variable
├─ IAM_CLIENT_SECRET  -> secret
├─ AGENTSAM_SDK_KEY   -> secret
└─ AGENTSAM_BRIDGE_KEY -> secret
```

For the Inner Animal Media SDK deployment the physical resources are:

```text
DB             = inneranimalmedia-business
WEBSITE_ASSETS = agentsam-os-blueprint-content
IAM_ORIGIN     = https://inneranimalmedia.com
```

`IAM_CLIENT_ID` is public by OAuth design. `IAM_CLIENT_SECRET`, `AGENTSAM_SDK_KEY`, and `AGENTSAM_BRIDGE_KEY` belong in Cloudflare secret storage and must never be committed.

`AGENTSAM_WORKER_ROLE` is not part of the SDK contract. The migration aliases `IAM_OAUTH_ISSUER` and `AGENTSAM_SDK_TOKEN` remain read-compatible inside SDK 2.5 for existing consumers, but they are not part of new Worker configuration.

## Local Ollama boundary

Ollama is a local CLI capability, not an edge binding. Do not configure `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, or `OLLAMA_EMBED_MODEL` on the SDK Worker. The defaults live in the local development kit:

```text
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder
OLLAMA_EMBED_MODEL=mxbai-embed-large
```

A remote AgentSam session uses the existing user-hosted terminal tunnel to execute `agentsam ollama ...` on the developer machine. That local process reaches loopback from the machine itself. Workers AI may remain available independently as `AGENTSAM_WAI`; it is not an Ollama proxy.

## Secrets

Install the three server-side values without printing them:

```sh
printf '%s' "$IAM_CLIENT_SECRET" | wrangler secret put IAM_CLIENT_SECRET --name agentsam-sdk
printf '%s' "$AGENTSAM_SDK_KEY" | wrangler secret put AGENTSAM_SDK_KEY --name agentsam-sdk
printf '%s' "$AGENTSAM_BRIDGE_KEY" | wrangler secret put AGENTSAM_BRIDGE_KEY --name agentsam-sdk
```

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
