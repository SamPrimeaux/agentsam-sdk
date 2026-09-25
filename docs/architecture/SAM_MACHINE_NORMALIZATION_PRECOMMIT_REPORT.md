# PRE-COMMIT REPORT — SAM Machine Normalization Sprint

**Date:** 2026-09-25  
**Repo:** `@inneranimalmedia/agentsam-sdk`  
**Status:** **NOT COMMITTED** — awaiting your review per sprint contract §32  
**Working tree:** dirty with the changes summarized below

---

## 1. Current command-catalog authority

- **Authority file:** `src/cli/command-catalog.js` (`CLI_COMMAND_CATALOG`)
- **Help:** `src/ui/cli/help.js` already consumes the catalog (topics/common/skill tips)
- **Tips:** `printAssistTip()` — human stderr only; **skipped for `--json`**
- **New:** `src/cli/dispatch.js` — lazy handler bootstrap (partial)

## 2. Remaining command truth still hardcoded in `cli.js`

- The giant `if/else` dispatch chain from `create` → `scaffold` is **still live**
- Legacy `printLegacyHelp()` prose block remains in `cli.js`
- Init interactive still hardcodes lane options (Full Stack / CMS / …)
- Catalog dispatch only wires: `codebaseindex|ingest`, `skills|skill`
- **Deferred:** full cutover of ~45 verbs to lazy catalog handlers

## 3. Final SamOperation contract (this sprint)

Rich fields now supported by `defineSamOperation()` / `src/sam/types.js`:

| Field | Role |
|-------|------|
| `id`, `version`, `module`, `action` | Identity |
| `summary` | Card/search |
| `purpose`, `outcome` | Product capability semantics |
| `accepts[]` | Material / input kinds |
| `phases[]` | Execution phases |
| `artifacts[]` | Produced artifact kinds |
| `skill` | `{ id, help }` or `null` |
| `preview` | `{ available, operation }` |
| `execution` | lanes, model, network, sideEffects, **embedding**, **provider_spend** |
| `risk`, `capabilities`, `cli`, `docs`, `status` | Policy + projections |
| `handler` | Existing machinery |

Thin `{ id, module, action, summary }` alone is **not** treated as a complete capability definition.

## 4. Commands / operations graduated in this working set

| Operation | Notes |
|-----------|-------|
| `repository.inspect` | Purpose/outcome/phases/accepts enriched; richer return refs |
| `brand.scan` | BrandPack-oriented contract; points to `brand.preview` |
| `codebaseindex.ingest` | Inventory-first phases; job graph artifact |
| `terminal.exec`, `security.scan`, `cad.blender.inspect` | Still on prior seed contracts (not re-authored this pass) |

Desktop:

| Item | Change |
|------|--------|
| Local Studio manifest | `launch_path: "/agentsam"` + `routes` + `auth` notes |

## 5. Skill mapping

| Command / op | Skill |
|--------------|-------|
| codebaseindex / ingest | `agentsam-codebaseindex` |
| repository.inspect | `agentsam-app-fundamentals` (until `agentsam-repository` skill exists) |
| brand.scan | `agentsam-app-fundamentals` (until `agentsam-brand` skill exists) |
| security | `agentsam-progression-guard` |
| cloudflare / mcp / go | `agentsam-cloudflare-workers` |

**Deferred:** dedicated `agentsam-brand`, `agentsam-repository`, `agentsam-security`, `agentsam-cad`, `agentsam-mcp`, `agentsam-identity` skill packs.

## 6. Generic material-ingest contract

- **Current:** `src/lib/ingest/materials.js` (stage under `.agentsam/ingest/<id>/`)
- **Shared:** used by codebaseindex; ops declare `accepts[]`
- **Deferred:** promote to first-class SAM material resolver for brand/cad/security; zip slip limits / symlink escape hardening tests; `--stdin` convention end-to-end

## 7. Inventory output schema

- `agentsam.inventory.v1` via `src/lib/ingest/inventory.js`
- Fields: counts, languages, top_level, suggested include/exclude, sample_paths, materials
- Human projection: `formatInventoryTree()` (ASCII is **not** authority)

## 8. Codebaseindex guided flow (now)

```text
① Connection discovery (credentials + ollama list)
② Materials (paste/drop)
③ INVENTORY / file map  ← confirm before scope
④ Include / exclude (inventory suggestions · manual · optional Ollama assist)
⑤ Embedding profile (discovered only; always includes none)
⑥ Vector lane: local | supabase+node-api | vectorize
⑦ Dry-run/plan (default) or execute
→ job graph printed
```

## 9. Local SQLite schema / migrations

- **Deferred:** portable spine migrations mirroring D1 logical core
- Today: existing `.agentsam/knowledge/index.sqlite` knowledge store only

## 10. D1 mapping (logical — not copied blindly)

`code_repositories`, merkle/evidence, `agentsam_code_index_job(+_file)`, `codebase_ast_nodes`, `codebase_dep_edges`, health, `agentsam_pgvector_lane_registry`

## 11. Supabase / Postgres mapping

Host SSOT tables (Gemini@1536):

- `agentsam.agentsam_codebase_chunks_gemini_embedding_2_1536`
- `agentsam.agentsam_codebase_files_gemini_embedding_2_1536`
- `agentsam.agentsam_codebase_ast_symbols_gemini_embedding_2_1536`
- `agentsam.agentsam_gemini_semantic_embeddings_1536`
- `agentsam.agentsam_documents_gemini_embedding_2_1536`

Customer template: BYO node-api edge + Hyperdrive (documented in `CODEBASEINDEX_GUIDED_PATH.md`).

## 12. Vectorize mapping

- Lane selectable in wizard as `vectorize`
- **Deferred:** full CF Vectorize adapter write path (receipt notes only today)
- IAM host code-index SSOT remains Supabase pgvector, not Vectorize

## 13. Embedding discovery source per provider

| Source | Mechanism |
|--------|-----------|
| OpenAI | Live `/v1/models` when credential configured |
| Gemini | Credential → knowledge adapter model list |
| Ollama | Live `/api/tags`; embed-like tags → embed picker; chat tags → scope assist |
| None | Always offered |

## 14. Profile identity / fingerprint

- Knowledge engine already fingerprints embedding profile (`embeddingProfileId`)
- Encoding: `provider|model|dimensions` (colon-safe for `mxbai-embed-large:latest`)
- Semantic retrieve fails closed on profile mismatch
- **Deferred:** replace `defaultDimensions()` regex with adapter metadata + Ollama probe length as sole authority

## 15. App discovery mechanism

- **Deferred:** `agentsam app options` from manifests (`apps/*/agentsam.app.json`, themes)
- Current `app` command path still mostly launcher-shaped

## 16. Init / app-options UX

- **Deferred:** replace hardcoded Full Stack/CMS/… init menu with discoverable apps/themes/materials start

## 17. BrandPack schema

- Added: `protocol/brand/brandpack.v1.schema.json` (`agentsam.brandpack.v1`)
- **Deferred:** `brand.preview` handler, localhost brand grid, pack export/import round-trip

## 18. Brand preview path

- Contract points to `brand.preview` with `sideEffects: local_write` intended
- **Not implemented** this pass (scan stays read-only)

## 19. Tests run

```text
node --test test/sam-kernel.test.mjs test/codebaseindex-ingest.test.mjs test/ingest-discover-models.test.mjs
→ 23 pass / 0 fail
```

## 20. Intentionally deferred

1. Full `cli.js` catalog cutover (kill legacy help + if/else)
2. `agentsam app options` + init discovery
3. `brand.preview` + BrandPack export/import UX
4. Shared material resolver with archive sandbox hard limits + tests
5. Ollama dimension probe as SSOT (retire name heuristics)
6. Metadata vs vectors storage split as first-class config object (wizard records lanes; knowledge.json still primarily sqlite|postgres)
7. Local SQLite portable D1-spine migrations
8. Customer node-api / Supabase template pack
9. Wire Local Studio session gate: `/agentsam` → session check → `/auth/login?next=/agentsam`
10. agentsamd behind Tauri (Slice H)
11. Rebuild/reinstall DMG after manifest change (needs `build-brand` + Tauri release)

---

## Desktop auth note (your screenshots)

Three surfaces:

| URL | Role |
|-----|------|
| `/` | PUBLIC marketing — **not** desktop home |
| `/auth/login` | IDENTITY |
| `/agentsam` | PRODUCT (Local Studio) |

Manifest fix: `launch_path: "/agentsam"`. Login entry: `/auth/login?next=/agentsam`. Re-run desktop brand build + reinstall to pick up in `/Applications`.

---

## Files touched (pending commit)

- `packages/agentsam-desktop-shell/manifests/local-studio.json`
- `packages/agentsam-desktop-shell/manifests/schema.json`
- `src/sam/types.js`, `define.js`, `client.js`
- `src/sam/operations/{repository-inspect,brand-scan,codebaseindex-ingest}.js`
- `src/commands/codebaseindex.js` (inventory-first wizard)
- `src/lib/ingest/{inventory,job-graph}.js`
- `src/cli/{command-catalog,dispatch}.js`
- `protocol/brand/brandpack.v1.schema.json`
- this report: `docs/architecture/SAM_MACHINE_NORMALIZATION_PRECOMMIT_REPORT.md`

**No commit / no push** until you approve.
