# Knowledge: existing Supabase Edge / node-api semantic lane

The CLI and SDK reuse a project's **existing** authorized Supabase Edge adapter. This is **not** a new database authority, schema, or standalone indexing engine. Parsing/source hashes and local generation history remain SDK Knowledge/Repository responsibilities; the existing Edge `node-api` performs remote Gemini embeddings and writes account-scoped pgvector projections.

## What is executable now

- The portable Node API client lives in `packages/agentsam-knowledge/src/backends/supabase-node-api.js`; it is available from the Knowledge backend registry (`supabase_pgvector.connect`).
- Public `node-api/health` and `/capabilities` are verified before configuration. Model/dimensions come from the **actual selected endpoint**, not a hardcoded SDK customer profile.
- `agentsam autorag setup --yes --backend supabase_pgvector --resource <EDGE-URL>` persists **only** project scope, a URL, backend, and embedding profile. The default new-project scope is `.` (all applicable project source files); `--scope` is an explicit user override. No IAM or other user's repository ID is assumed.
- `agentsam index plan` and `agentsam index run` prepare a source-hashed structural/text generation in the selected local store without paid embedding requests. `agentsam autorag remote --publish --allow-paid --max-inputs 100 --account-id <AUTHORIZED-ID>` submits that generation's content to Edge, which performs Gemini embedding. `autorag remote --query ... --allow-paid --account-id <AUTHORIZED-ID>` queries the Edge's account/repository-filtered pgvector RPC.
- A host must inject the bridge authorization into the server-side Node/API runtime. **Never put `AGENTSAM_BRIDGE_KEY` in `.agentsam/knowledge.json`, a browser, Tauri webview, or a project README.** Programmatic hosts may inject `getAuthHeaders`; no user-specific credential is shipped by the SDK. Local CLI remote query/publish fails closed until a trusted host makes authorization available.
- The CLI refuses `index run --embed` and `search --semantic` for this backend, rather than silently doing local semantic work while labeling it Supabase.
- `autorag doctor` distinguishes **endpoint reachable**, **profile compatible**, **protected endpoint authenticated**, **current local generation**, and **remote generation proof**. Health/capability metadata alone cannot make the remote lane `READY`.

## Example

```sh
agentsam autorag setup --yes --backend supabase_pgvector \
  --resource "https://<your-project-ref>.supabase.co/functions/v1/node-api" \
  --scope .
agentsam autorag remote            # Public health and profile compatibility, no paid API call
agentsam index plan                # Current source inventory, no remote write
agentsam index run                 # Deterministic local facts and generation

# Run only within an authorized host/operator environment with a server-side bridge key.
agentsam autorag remote --publish --allow-paid --max-inputs 100 --account-id <authorized-account>
agentsam autorag remote --query "Where is the checkout handler?" \
  --allow-paid --account-id <authorized-account>
```

You can run without a Supabase-specific binary, Python scripts, Docker, or a fixed `src`/`docs` scope. The same SDK remains usable with `local_exact`, a direct Postgres/pgvector storage adapter, and optional Cloudflare Vectorize.

## Current limits and honesty

This is a **single selected lane** in the existing `knowledge.json` v2 schema. Multiple independent, simultaneous code/docs/memory lanes per project remain a future schema upgrade. The Edge's existing codebase corpus is Gemini Embedding 2 at 1,536 dimensions; choosing another incompatible provider or dimension **does not silently reconfigure its physical table**. Use an independently configured compatible target or migration when changing embedding spaces.

Remote publishing is a distinct explicit action, not an automatic side effect of local `index run`. The Node API ingestion receipt proves accepted/completed batch handling, **not** that the application's canonical D1 generation was activated, that the Worker has read-after-write visibility, or that a current generation passed an authorized semantic query. Those require separate end-to-end evidence from the owning host. No production migration or automatic host deployment is performed by the SDK command.

Current project connections may offer a private host proxy that supplies credentials without exposing them to consumers. A user who lacks host authorization will receive `authorized_host_required`, not a faux-success fallback or an arbitrary personal SDK key.

Paid remote publication is budget-capped at 100 selected chunks by default; raise `--max-inputs N` explicitly after reviewing the current `index plan`. This is a **cost guard**, not a fixed source scope.

For a document corpus, pass `--corpus documents` to both `autorag remote --publish` and `autorag remote --query`. The adapter marks and queries each repository using its own `source_type` selector, because the existing documents matching RPC has no `repository_id` argument. The codebase corpus uses the RPC's native repository filter.

## Connected Local Studio Worker bridge

A self-hosted Studio Worker can expose an **authenticated** same-origin route under `/api/knowledge/node-api/` forwarding only `health`, `capabilities`, `codebase/status`, `vectors/status`, `memory/status`, `generations`, `vectors/query`, `codebase/ingest`, and `vectors/ingest`. This route derives account identity from the validated Studio session and supplies its own `AGENTSAM_BRIDGE_KEY` to Edge; the caller never receives the secret. The selected upstream address is configured with the Worker-side `AGENTSAM_NODE_API_URL` (deployment-specific; not required by the generic SDK).

The CLI's `--session-auth` switch deliberately consumes only an **already validated Studio-native session** injected on the host side as `AGENTSAM_STUDIO_SESSION_TOKEN`, together with an explicit `--trusted-origin` matching the configured gateway endpoint. This credential must not be put into project config, frontend JavaScript, `.env` committed files or CLI command-line arguments. An IAM CLI OAuth access token is **not** a Studio session ID and is not substituted for one. In-app Studio fetches may instead use the existing HttpOnly session cookie on the same origin.

For the gateway, protected `/codebase/status` is the bridge-secret equality check, while public `/health` and `/capabilities` prove endpoint availability only. Query/ingest require the caller to explicitly approve paid operations and the Worker caps each request to 20 chunks and a bounded payload, while retaining user-controlled repository scope. A successful Edge ingest response is **not** a canonical generation activation receipt.
