# `agentsam-sdk` Cloudflare application

The SDK repository root owns package/tooling concerns. Each deployable product under `apps/` owns its own runtime. For Local Studio, the production Cloudflare application is owned by `apps/local-studio/backend/`.

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
   │  ├─ worker/
   │  │  └─ index.js        checked-in Worker authority
   │  └─ server/            Nitro routes/runtime modules
   └─ shared/agentsam/package.json
```

`backend/worker/index.js` is the stable Cloudflare entrypoint and imports the generated Nitro handler from `../../.output/server/index.mjs`. `backend/wrangler.jsonc` therefore points to `worker/index.js`; assets remain generated under `../.output/public`.

```text
main             = worker/index.js
assets.directory = ../.output/public
```

Run installs from `apps/local-studio/` with its committed lockfile:

```sh
npm ci
npm run build
npm run cf:verify-output
npm run cf:dry-run
```

Production uses only `https://agentsam.inneranimalmedia.com`; `workers_dev` is disabled. The SDK root has no production `worker/` or `wrangler.jsonc`.

## Binding contract

```text
agentsam-sdk
├─ DB                  -> inneranimalmedia-business
├─ WEBSITE_ASSETS      -> agentsam-os-blueprint-content
├─ AGENTSAM_WAI        -> Workers AI provider
├─ EXECOS              -> execos service binding
├─ PTY_SERVICE         -> iam-vpc VPC service
├─ IAM_OAUTH_ISSUER    -> https://inneranimalmedia.com
├─ IAM_ORIGIN          -> migration fallback
├─ IAM_CLIENT_ID       -> public OAuth client id
├─ IAM_CLIENT_SECRET   -> secret
├─ AGENTSAM_API_KEY    -> aak_ account credential (only when a reusable account credential is needed)
└─ AGENTSAM_BRIDGE_KEY -> secret
```

Hosted model credentials are secrets: `XAI_API_KEY`, `OPENAI_API_KEY`, and `GEMINI_API_KEY`. Grok model inference is the `XAI_API_KEY` provider lane and is independent from the pre-wired Grok gate viewer identity/session system.

`AGENTSAM_WORKER_ROLE` is not part of the SDK contract. `IAM_OAUTH_ISSUER` is the canonical IAM authority; `IAM_ORIGIN` is a migration fallback. Reusable account API credentials use `AGENTSAM_API_KEY` with an `aak_` prefix. Browser login sessions and machine/infrastructure credentials remain separate and must not be promoted into account API keys.

## Ollama

Ollama is local compute with two ways to reach it:

```text
CLI on developer machine
  -> http://127.0.0.1:11434

agentsam-sdk Worker
  -> EXECOS service binding
  -> explicit target=local + neutral cwd (`/`)
  -> existing local execution/tunnel fabric
  -> http://127.0.0.1:11434
```

There is no production `OLLAMA_BASE_URL` and no public Ollama hostname. `PTY_SERVICE` remains the lower-level VPC/PTY health lane; model execution goes through ExecOS rather than bypassing the dispatcher. Ollama commands are filesystem-independent, so the ExecOS cwd defaults to portable `/`; `OLLAMA_LOCAL_CWD` can override it when needed. Default local models are `qwen2.5-coder` for chat/code and `mxbai-embed-large` for embeddings.

## Merkle persistence

Semantic deployment snapshots use the logical `WEBSITE_ASSETS` binding and the provider-neutral `agentsam_fs_merkle_snapshots/` namespace. D1 indexes the snapshot row in `agentsam_fs_merkle_snapshots`; R2 stores the full document. Customer/generated Workers keep the same logical binding and may point it at their own selected storage.

```text
root_hash      = content identity
policy_hash    = capture-scope identity
metadata_root  = semantic/index identity
```
