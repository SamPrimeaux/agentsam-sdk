# `agentsam-sdk` Cloudflare application

`agentsam-sdk` is the package/contract owner. The deployed Cloudflare application is owned by the nested Local Studio backend, not by a second Worker shell at the SDK repository root.

```text
agentsam-sdk/
├─ package.json
├─ package-lock.json
├─ packages/...
└─ apps/local-studio/
   ├─ package.json
   ├─ package-lock.json
   ├─ frontend/package.json
   ├─ backend/
   │  ├─ package.json
   │  ├─ wrangler.jsonc
   │  └─ server/
   └─ shared/agentsam/package.json
```

The TanStack/Nitro build is the Worker runtime:

```text
apps/local-studio/.output/server/index.mjs
apps/local-studio/.output/public/
```

Because `wrangler.jsonc` lives in `backend/`, its paths are deliberately relative to that directory:

```text
main             = ../.output/server/index.mjs
assets.directory = ../.output/public
```

Run installs from `apps/local-studio/` with its committed lockfile:

```sh
npm ci
npm run build
npm run cf:verify-output
npm run cf:dry-run
```

Production uses only `https://agentsam.inneranimalmedia.com`; `workers_dev` is disabled.

## Binding contract

```text
agentsam-sdk
├─ DB                 -> inneranimalmedia-business
├─ WEBSITE_ASSETS     -> agentsam-os-blueprint-content
├─ AGENTSAM_WAI       -> Workers AI provider
├─ EXECOS             -> execos service binding
├─ PTY_SERVICE        -> iam-vpc VPC service
├─ IAM_ORIGIN         -> https://inneranimalmedia.com
├─ IAM_CLIENT_ID      -> public OAuth client id
├─ IAM_CLIENT_SECRET  -> secret
├─ AGENTSAM_SDK_KEY   -> secret
└─ AGENTSAM_BRIDGE_KEY -> secret
```

Hosted model credentials are secrets: `XAI_API_KEY`, `OPENAI_API_KEY`, and `GEMINI_API_KEY`. Grok model inference is the `XAI_API_KEY` provider lane and is independent from the pre-wired Grok gate viewer identity/session system.

`AGENTSAM_WORKER_ROLE` is not part of the SDK contract. `IAM_OAUTH_ISSUER` and `AGENTSAM_SDK_TOKEN` are SDK 2.5 migration-read aliases only; new configuration uses `IAM_ORIGIN` and `AGENTSAM_SDK_KEY`.

## Ollama

Ollama is local compute with two ways to reach it:

```text
CLI on developer machine
  -> http://127.0.0.1:11434

agentsam-sdk Worker
  -> EXECOS service binding
  -> explicit target=local
  -> existing local execution/tunnel fabric
  -> http://127.0.0.1:11434
```

There is no production `OLLAMA_BASE_URL` and no public Ollama hostname. `PTY_SERVICE` remains available as the lower-level VPC/PTY transport and health lane, but model execution goes through ExecOS rather than bypassing the dispatcher.

Default local models are `qwen2.5-coder` for chat/code and `mxbai-embed-large` for embeddings.

## Merkle persistence

Semantic deployment snapshots use the logical `WEBSITE_ASSETS` binding and the provider-neutral `agentsam_fs_merkle_snapshots/` namespace. D1 indexes the snapshot row in `agentsam_fs_merkle_snapshots`; R2 stores the full document. Customer/generated Workers keep the same logical binding and may point it at their own selected storage.

The identities remain independent:

```text
root_hash      = content identity
policy_hash    = capture-scope identity
metadata_root  = semantic/index identity
```
