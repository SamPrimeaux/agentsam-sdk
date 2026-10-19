# CAD execution storage and delivery

**Authority:** `@inneranimalmedia/agentsam-sdk` owns CAD project/SAM contracts. CAD Creator owns its Worker routes and manifest. Existing `agentsam_cad_jobs`, `scene_snapshots`, and `agentsam_artifacts` D1 tables remain the database authority; no second schema or job registry is introduced.

## Local CAD runtime and filesystem

`agentsam dockerize cad --tools all` provisions a persistent Docker named volume `<service>-data` at `/work`, not tmpfs. The runtime process retains non-root execution, capability dropping, loopback binding and bearer-token protection. The root filesystem remains read-only by default; **`--cad-writable-root`** explicitly enables container-root writes for operators needing `docker cp` or project-specific tooling.

`--volume <name>` selects a persistent volume. **`--cad-mount drawings=/absolute/host/directory`** is repeatable and exposes exactly that already-existing host directory at `/mounts/drawings` with read/write access. Operator choices become the runtime's `AGENTSAM_CAD_FILE_ROOTS`; callers select mount aliases, never arbitrary host filesystem paths.

Authenticated local HTTP file routes:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/files/:mount/:path` | Download bytes and SHA-256 ETag or list directory |
| PUT | `/v1/files/:mount/:path` | Atomic binary write, optional X-Content-Sha256 verification |
| DELETE | `/v1/files/:mount/:path` | Delete file or empty directory |
| POST | `/v1/files/:mount/mkdir` | Create a directory, JSON `{ "path": "drawings" }` |
| POST | `/v1/files/:mount/move` | Rename/move within one mounted root; JSON source/target |

All file operations require the CAD service's trusted bearer token. Traversal, unknown mounts and unbounded raw writes are rejected. A Docker volume persists across restart/container replacement but can still be lost if explicitly deleted by its owner; production systems should separately deliver durable artifacts to R2.

## Hosted CAD Creator Worker

Bindings are declared in `backend/wrangler.jsonc`: `DB` → `inneranimalmedia-business`, `WEBSITE_ASSETS` → `cad`. The installed application manifest declares the artifact prefix, bucket name, OAuth audience and required scopes.

The Worker delegates bearer verification to the explicitly provisioned **`CAD_AUTH_VERIFIER` service binding**, or the existing `MCP_TOKEN_VERIFY_URL` host-side verifier. The verifier must respond over a trusted authenticated backend with `active: true`, `sub` (account actor), `aud: "cad-creator"`, `projects` (allowed project slugs), and space-separated `scope` permissions. Optional `tenant_id` and `workspace_id` are trusted issuer attributes; never accept them from request bodies or caller-provided headers. Missing verifier or grants fail closed (503/401/403); do not expose the bridge key or any Cloudflare credentials to the browser or CAD engine.

- `GET|HEAD|PUT|DELETE /api/cad/artifacts/:project/:revision/:file`
- `GET /api/cad/artifacts/:project/:revision?list=1`
- `GET|HEAD|PUT|DELETE /api/cad/evidence/:project/:runId/:assetPath`
- `GET /api/cad/evidence/:project/:runId/:prefix?list=1`

`PUT` verifies SHA-256, writes R2 first, then **attempts** existing D1 registration. Any D1 failure is explicitly returned in the receipt without discarding the completed R2 upload. `GET` recomputes and verifies R2 hash. Existing keys require a matching `If-Match` SHA-256 ETag for update. The remote SAM HTTP ports expose artifact CRUD; `createHostedEvidenceStore` implements the original `sam.evidence.*` store surface over the same routes using a host-injected authenticated request callback.

## Completion gates

Verified locally: mounted filesystem CRUD, restart persistence, real CAD container health, R2/D1 API contract tests using simulated bindings, `sam.evidence.begin` → `capture` → `seal` with hosted adapter, Worker bundling/dry-run with named D1/R2 resources.

**Not certified until tested live:** Worker deployment, actual OAuth verifier configuration, live authorized CAD artifact upload/readback/deletion, live D1 job/revision registration, and SAM-to-remote-job dispatch. The Cloudflare Worker does not run a native CAD binary by itself. The existing hosted `/api/cad/execute` correctly returns `cad_host_required` when no authorized native execution host is available. Do not activate registry tools solely because the filesystem and schema support exists.
