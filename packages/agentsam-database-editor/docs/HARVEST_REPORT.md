# Database Editor harvest + installer normalization

**Repo:** `agentsam-sdk` only (no IAM refactor).  
**Status:** pre-commit draft — review before commit.  
**Donor:** Inner Animal Media `/dashboard/database` (+ peel package `@inneranimalmedia/agentsam-database-studio` in IAM monorepo).  
**Target:** `@inneranimalmedia/agentsam-database-editor` · `app_id = database-editor` · Local Studio route `/database`.

---

## 1. Donor file / API map

### UI (donor)

| Surface | Path |
|--------|------|
| Route shell | `inneranimalmedia/app/dashboard/components/DatabasePage.tsx` |
| Studio | `…/DatabaseStudio.tsx` |
| Controller | `…/database/hooks/useDatabaseStudioController.ts` (+ browse/crud/sql/resources/route hooks) |
| Analytics overview | `…/analytics/tabs/DatabasesTab.tsx` |
| Types | `app/dashboard/types/databaseExplorer.ts` |
| Route helpers (re-export) | `app/dashboard/src/lib/databaseStudio*.ts` → IAM package |

### Peel package already in IAM (donor contract, not authority)

`packages/agentsam-database-studio/` — route inventory, ownership helpers, thin frontend API path builders. Still mounts `/dashboard/database` and provider-specific `/api/d1/*` vs `/api/hyperdrive/*`.

### Backend APIs (donor)

| Concern | Routes / handlers |
|--------|-------------------|
| Analytics | `GET /api/analytics/databases{,/:id}` |
| D1 | `/api/d1/tables`, `/api/d1/table/:name/{rows,schema}`, `POST /api/d1/query`, export |
| Hyperdrive / platform PG | `/api/hyperdrive/*` |
| Customer Supabase | `/api/data-plane/customer-supabase/...` |
| OAuth connect | `/api/oauth/{cloudflare,supabase}/{start,callback}` |

### Harvest (keep behavior)

database selector · CF/Supabase switching · stats · schema explorer · SQL editor · result grid · row CRUD · pagination · filters · CSV export · query graphs/metrics

### Reject / strip

`workspace_id` as owner · `/dashboard` routing · IAM-only account assumptions · hardcoded D1/Supabase as the product · UI `if (provider === …)` trees · secrets in connection rows

---

## 2. DatabaseAdapter contract

Defined in `packages/agentsam-database-editor/src/contracts/adapter.js`:

`capabilities · introspect · listTables · describeTable · query · insert? · update? · delete? · health? · applyMigration?`

Factories (stubs): `createSqliteAdapter | createD1Adapter | createPostgresAdapter | createSupabaseAdapter`.

**Rule:** React/CLI never branch on provider; they receive a `DatabaseAdapter`.

Non-fatal migrations: statement-by-statement where dialect allows; log per-statement failures.

---

## 3. Connection schema

`protocol/database/connection.v1.schema.json` + `src/contracts/connection.js`:

```
engine:     sqlite | postgres | mysql
provider:   local | cloudflare-d1 | supabase | postgres | mysql
accelerator?: { driver: hyperdrive, configurationId, localConnectionStringRef? }
vectors?:   { driver: none|sqlite_exact|sqlite_vector|pgvector|vectorize, profileId? }
connection: path | databaseId+binding | credential_ref (vault) — never raw secrets
account_id?: optional hosted owner — never workspace_id
```

Examples:

- Local: `{ engine: sqlite, provider: local, connection: { path: ".agentsam/agentsam.sqlite" } }`
- D1: `{ engine: sqlite, provider: cloudflare-d1, connection: { databaseId, binding: "DB" } }`
- Supabase: `{ engine: postgres, provider: supabase, connection: { credential_ref: "vault://…" }, vectors: { driver: pgvector } }`
- Edge PG: same postgres + `accelerator: { driver: hyperdrive, … }`

**Hyperdrive ≠ vector store.** Vectorize/pgvector/sqlite_* are vector drivers only.

---

## 4. Local SQLite flow (must work with zero cloud)

```
agentsam database
agentsam database open .agentsam/agentsam.sqlite
# or
agentsam app start database-editor
```

1. EmptyState (shell-kit): “No databases connected” → Open local / Connect hosted  
2. Open `.sqlite` / `.db` → `createSqliteAdapter({ path })`  
3. Overview · Schema · Data · SQL · Vectors · Connections · Metrics  
4. Browse / filter / insert / update / delete / export  
5. Optional Vectors: generations + profiles (exact cosine initially)  
6. No IAM, Cloudflare, or Supabase required  

Same UX as donor studio, different adapter.

---

## 5. D1 flow

1. Connect via Cloudflare OAuth / existing Worker binding (`connection.binding`)  
2. `createD1Adapter` → same `DatabaseAdapter` surface  
3. Metadata stays D1; Vectors optional → Vectorize (`vectors.driver = vectorize`) with **explicit** embedding profile  
4. Credentials: vault `credential_ref` / Worker secrets — not connection JSON  

---

## 6. Supabase / Postgres flow

1. Connect existing AgentSam connection or OAuth  
2. `createSupabaseAdapter` / `createPostgresAdapter` (same dialect)  
3. Optional Hyperdrive accelerator (prod Worker path); local uses direct/`localConnectionStringRef`  
4. Vectors → `pgvector`  
5. Provisioning (codebaseindex / database setup): versioned migrations + Node API template — user approves dry-run  

---

## 7. UI route / preview (Local Studio)

| Route | Purpose |
|-------|---------|
| `/database` | Editor shell + EmptyState |
| `/database/connections` | Connection registry |
| `/database/vectors` | Vectors surface (adapts to active connection) |

Nav sections: **Overview · Schema · Data · SQL · Vectors · Connections · Metrics**

No `/dashboard/*`. Compose in `apps/local-studio` from this package + shell-kit EmptyState.

---

## 8. Installer before / after

### Before (brittle)

```
pathname → INSTALL_APP_TARGETS map
  → string-replace AGENTSAM_DEFAULT_APP into install.sh
  → ambient default app on machine
```

`scripts/install.sh` uses `AGENTSAM_DEFAULT_APP`; Worker `serveInstallScript` mutates the script body.

### After (canonical)

```
curl -fsSL https://agentsam.inneranimalmedia.com/install \
  | bash -s -- --app-id database-editor

agentsam app install database-editor
sam.invoke("app.install", { app_id: "database-editor" })
```

- One generic `/install` script  
- Parses `--app-id` / `--version` only  
- Resolves app via **app registry / agentsam.app.json** (`id` stable)  
- Unknown `app_id` → fail with available choices  
- **Remove** `AGENTSAM_DEFAULT_APP` and `INSTALL_APP_TARGETS` string mutation  
- Cards derive install lines from `agentsam.app.json` (`install.curl` / `install.command`)  

Shell may use temporary `APP_ID=` while installing; product identity remains `app_id` in manifests/API.

Draft manifest: `packages/agentsam-database-editor/agentsam.app.json`.

---

## 9. AgentSam Intelligence vs AGENTSAM_WAI vs embeddings

| Layer | Role |
|-------|------|
| **SAM machine intelligence** | Deterministic: inventory, capability checks, dimension/store constraints, profile fingerprints, migration impact (`safe|reindex|reembed|migrate|destructive|unsupported`). Authoritative. |
| **AgentSam Intelligence** | NL assist for setup/scope/tooltips/explanations. Label in UI: “Suggest scope with AgentSam Intelligence”. Advisory only. |
| **AGENTSAM_WAI** | Platform baseline for Intelligence when user has no provider. **Not** embeddings, long jobs, or silent provider substitute. |
| **User provider/model** | Explicit selection for embeddings/generation via discover → choose → profile. |

Guidance resolution: explicit guidance model → user preference → `AGENTSAM_WAI` → deterministic text only.

Embedding policy: `src/contracts/embeddings-policy.js` + `protocol/embeddings/embedding-profile.v1.schema.json`.  
Ollama = experimental/local proof, never default/fallback.

`configuration.guard` / `retrieval.change.plan` (future SAM ops) before any reembed/migrate.

---

## 10. Icon vocabulary

`protocol/ui/icon.v1.schema.json` + `src/contracts/icon-vocabulary.js`.

Store semantic keys (`database`, `security`, …) — **not** emoji, **not** Lucide ids. CLI maps to a small glyph set; web/mobile choose their own.

Skills `icon` column should use these keys (aligns with skill v2 `icon` field).

---

## 11. Remaining env vars (justified)

| Env / binding | Keep? | Justification |
|---------------|-------|---------------|
| `AGENTSAM_HOME` | yes | Machine install root |
| `AGENTSAM_API_KEY` | yes | Delegated `aak_*` control-plane |
| `IAM_ORIGIN` / OAuth client vars | yes | Hosted identity |
| `DATABASE_URL` / Hyperdrive local string refs | yes | Connection config by **ref** |
| `CLOUDFLARE_ACCOUNT_ID` | yes | CF resource ops |
| `AGENTSAM_WAI` | yes | Intelligence baseline binding (guidance only) |
| `AGENTSAM_BRIDGE_KEY` | yes | Machine service auth |
| `VAULT_MASTER_KEY` | yes | App-owned BYOK (per Worker) |
| **`AGENTSAM_DEFAULT_APP`** | **remove** | Hidden product intent |
| `AGENTSAM_DEFAULT_*` (page/theme/workspace) | **avoid** | Prefer explicit ids in ops |

---

## 12. Package layout (target)

```
agentsam-database-editor
├── database core (schema/tables/query/mutations)
├── connection adapters (sqlite, d1, postgres, supabase, hyperdrive path)
├── vector adapters (sqlite_exact, sqlite_vector, pgvector, vectorize)
├── embedding profile registry (shared SAM — not owned by editor)
├── metrics adapters
└── UI (Overview … Metrics)
```

Embedding generation stays in shared SAM (`embeddings.discover` / `vectors.index`) — editor inspects/queries only.

---

## 13. Phase 1 (after approval — still agentsam-sdk)

1. Implement SQLite adapter + local open path + EmptyState route in Local Studio  
2. Normalize installer `--app-id`; delete `AGENTSAM_DEFAULT_APP` mutation  
3. Port D1/Postgres adapters behind the same contract  
4. Wire Vectors tab to profile registry (discover, no defaults)  
5. Do **not** rewrite IAM dashboard in-place — donor stays donor  

---

## Pre-commit checklist (this draft)

- [x] Donor map  
- [x] DatabaseAdapter contract  
- [x] Connection schema  
- [x] Local / D1 / Supabase flows described  
- [x] UI routes proposed  
- [x] Installer before/after  
- [x] Env inventory  
- [ ] **Commit** — waiting for your review  
