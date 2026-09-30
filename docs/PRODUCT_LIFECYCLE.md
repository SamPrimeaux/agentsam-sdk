# AgentSam product lifecycle — infra at a glance

**Status:** standing engineering law (2026-09-30)  
**Repo tip when audited:** Lane 0d CI trust branch (from `7684a4e5`)  
**Companion:** [apps/README.md](../apps/README.md) (product app ownership boundary)

This document is the glanceable SSOT for **implement → prove → extract → rebrand → repack → install**.  
Do not invent a new product architecture. Close the graduation loop around the machinery that already exists.

The global agent/runtime law is [`AGENTSAM.md`](../AGENTSAM.md). This lifecycle document applies that law to product authoring, extraction, resale, and graduation.

---

## 0. AgentSam system model + global product conduct

AgentSam is two cooperating layers, not a choice between “old agents” and “LLMs”:

```text
OLD-SCHOOL / DETERMINISTIC AGENTSAM (SAM)
  discover → classify → validate → route → execute → verify → receipt
                  │
                  ▼
LLM AGENTSAM
  interpret → reason across valid options → compose/transform → explain
                  │
                  ▼
              trusted action
```

**SAM establishes machine truth. LLMs augment judgment and language.**

The deterministic layer owns repository/project discovery, Git/Merkle evidence, manifests, AST/indexes, capability doctors, providers/runtime bindings, schemas/migrations, typed operations, authorization constraints, execution, and verification receipts. The LLM layer consumes that evidence to understand intent, resolve ambiguity, plan, compose, transform, and explain. It must not replace deterministic discovery with guesses or turn hidden reasoning/transcripts into system authority.

### Global repurposability contract

Every product/capability/pipeline promoted through this SDK must satisfy these rules:

1. **Build once; repurpose by data/config/brand.** Customer differences belong in manifests, company/brand rows, themes, provider grants, schemas/data, and content rather than bespoke source forks.
2. **Zero operator bleed.** A clean install for user123 must not inherit developer usernames, device names, absolute paths, domains, account/database IDs, repositories, credentials, or another customer's content/resources.
3. **One authority per concern.** Extend the existing Identity, Database, Settings, theme, registry, runtime, and connector authorities instead of creating parallel “temporary” implementations.
4. **Support means implemented now.** A provider/backend/datastore/runtime marked supported must have a working contract + adapter + verification path. Placeholder/follow-up implementations are not production support.
5. **Customer evidence beats SDK assumptions.** In an unrelated repository, AgentSam describes and uses that repository's actual manifests, Wrangler bindings, selected providers, storage, and runtime capabilities.
6. **Principal-scoped resources only.** Missing authorization never falls back to platform-owner infrastructure or metrics.
7. **Portable from the artifact.** Advertised commands/products must work from the actual packed/published artifact outside this monorepo; repo-local `file:` escapes do not count.
8. **Machine-provable readiness.** “Ready,” “healthy,” “graduated,” and “supported” are receipt-backed states, not copy. Failure must be explicit and capability-specific.
9. **Deterministic first where reliable.** Do not spend model context/tokens to rediscover facts Git, Merkle, AST, schemas, manifests, or capability probes can answer exactly.
10. **LLM augmentation stays valuable.** Use models where they materially help interpretation, planning, transformation, or explanation; feed them compact verified evidence and keep execution/authorization in trusted machinery.

These are release/architecture requirements, not style preferences. Cursor/Codex/Claude-compatible instruction shims must ultimately defer to `AGENTSAM.md`.

---

## 1. Repo roles (keep this layout)

```text
agentsam-sdk/
│
├── apps/              PRODUCT / PREBUILD AUTHORING (source of truth for runnable products)
├── packages/          REUSABLE CAPABILITIES (Identity, vault, settings, database-editor, …)
├── native/            DETERMINISTIC ENGINES (agentsam-machine, …)
├── bin/               PUBLIC COMMAND ENTRYPOINTS
├── src/               CLI / ORCHESTRATION GLUE
├── registry/          GENERATED indexes + receipts (derived state — not a second hand list)
├── migrations/        PORTABLE schema packs
├── contracts/         MACHINE-READABLE contracts
├── scripts/           BUILD / PROVE / RELEASE tooling
└── docs/              LAW + RECEIPTS
```

**Law from `apps/README.md` (unchanged):**

> `apps/` is the development/authoring source of truth for runnable AgentSam product surfaces.  
> **Product apps are independently extractable.**

`packages/` is not a mistake when an app depends on it.  
**Escape hatch that is a mistake:** `file:../../../packages/foo` that only resolves inside this monorepo.

---

## 2. What lives where

### `apps/` — products, seeds, runtimes

| Path | Class | Notes |
|---|---|---|
| `local-studio/` | Major prebuilt product | Most capable; least independently extractable today |
| `client-cms-editor/` | Major prebuilt product | Package-ready; scaffold semantics inconsistent |
| `cad-creator/` | Major prebuilt product | **Reference graduation path** (strict product proof PASS) |
| `ecommerce-cms-agentsam/` | Prebuilt, not graduated | Real product tree; fails product-app + npm proof |
| `*-site/` | Site/theme seeds | Donor lane for theme packages |
| `agentsam-go-worker/`, `agentsamd/` | Runtime / daemon | Not storefront products |
| `project-control/`, `theme-gallery-preview/` | Support / preview | |
| `frontend/` | Public-site seed lane | Not a full product workspace |
| `_incoming/` | Import drop zone | |

Scale signal: apps authoring dominates packages (~3k vs ~0.8k source files excluding dependency trees). Apps are not demos.

### `packages/` — capabilities (selected)

Identity · vault · settings · database-editor · desktop-shell · work · workbench · nav · shell-kit · contracts · runtime-protocol · content/CMS helpers · repository · knowledge · rapid-rust · brand · heuristic-theme · `theme-*` · …

### App catalog vs package-presented app

`agentsam app list` currently sees:

| App id | Manifest location | Class |
|---|---|---|
| `local-studio` | `apps/local-studio/` | **standalone product** |
| `client-cms-editor` | `apps/client-cms-editor/` | **standalone product** |
| `cad-creator` | `apps/cad-creator/` | **standalone product** |
| `ecommerce-cms-agentsam` | `apps/ecommerce-cms-agentsam/` | **standalone product** (not graduated) |
| `database-editor` | `packages/agentsam-database-editor/` | **embeddable capability with app surface** |

Registry must eventually distinguish those two classes. One catalog, two product-classes — not two conflicting authorities.

Architecture test today only names: `local-studio`, `cad-creator`, `client-cms-editor`.  
If a manifest claims a graduated prebuilt app, **either** the same product law applies **or** the manifest explicitly marks non-graduated.

---

## 3. Prebuild state (audit snapshot)

| Product | Source | Local | Cloud | Packaging / extract |
|---|---|---|---|---|
| CAD Creator | `apps/cad-creator` | Ready | Scaffold | Closest to gold path |
| CMS Editor | `apps/client-cms-editor` | Ready | Adapter-ready | npm pack OK; scaffold ≠ full extract |
| Local Studio | `apps/local-studio` | Ready | Ready/live | Most capable; 20 escaping `file:` deps |
| Ecommerce + CMS | `apps/ecommerce-cms-agentsam` | Ready-ish | Not started | Real tree; not graduated |
| Database Editor | `packages/agentsam-database-editor` | Embeddable | Hosted/native adapters | Capability-as-app |

### Strict product proof (`scripts/prove-agentsam-product.mjs`)

| Product | App | npm/package | World | Overall |
|---|---|---|---|---|
| CAD Creator | PASS | PASS | PASS | **PASS** |
| CMS Editor | FAIL scaffold contract | PASS | PASS | FAIL |
| Ecommerce CMS | FAIL scaffold contract | FAIL | PASS | FAIL |
| Local Studio | FAIL scaffold | FAIL | PASS | FAIL |

CAD is the packaging/graduation reference — not necessarily the product-architecture template for every app.

---

## 4. Intended closed loop (non-negotiable direction)

```text
apps/<product>
      │
      ▼
agentsam app validate
      │
      ▼
agentsam machine inspect
      │
      ▼
agentsam app prove   ← promote scripts/prove-agentsam-product.mjs to first-class CLI/CI
      │
      ├── isolated scaffold (complete product extract)
      ├── npm pack + install from tarball outside monorepo
      ├── migrations (SQLite + D1 packs)
      ├── package boundaries (no escaping file: deps)
      ├── personal-data leak scan
      ├── browser trust / execution boundaries
      ├── native/runtime capability check (advertised bins must ship)
      └── build / doctor / smoke
      │
      ▼
PORTABILITY RECEIPT  →  registry (derived)
      │
      ▼
agentsam init / installable picker
      │
      ▼
USER123 INSTANCE   (their brand, their D1/SQLite, their OAuth — zero Sam bleed)
```

**Hard rule:** `runtime.source_scaffold = ready` (or equivalent) may only be written when a current prove receipt is green.

That rule alone kills the Local Studio contradiction: manifest says scaffold ready, `agentsam app scaffold local-studio` → `unknown command: scaffold`.

### Core commands (compose existing tools — do not invent a parallel stack)

```text
agentsam app validate <product>
agentsam machine inspect <product-root>
agentsam app prove <product>          # mini | app | world + pack/install
agentsam app graduate <product>       # only if prove receipt PASS
```

CAD already proves the destination. Local Studio / CMS / Ecommerce are the failing cases that harden the machine.

---

## 5. Vocabulary — stop conflating “scaffold”

| Command intent | Meaning |
|---|---|
| `agentsam app scaffold <product>` | **Instantiate the complete proven product** (full `frontend/` + `backend/` + `shared/` extract) |
| `agentsam scaffold <preset>` | Generate a **smaller starter** from a feature/preset |
| `agentsam-cms create --starter …` | Create a **CMS content/theme project** |

Same underlying generators allowed. **Contracts must not share one word for two outcomes.** Product-proof expects meaning #1.

---

## 6. Single product authority

**Today (too many hands):**

- `agentsam.app.json` manifests  
- `src/lib/init-options.js` hardcoded scaffold list  
- presets registry  
- `registry/.../installable-products.json` cache (incomplete: cms / client-cms-editor / rapid-rust only)

**Target:**

```text
agentsam.app.json
        │
        ▼
generated product registry   (derived only)
        │
        ├── agentsam app list
        ├── agentsam init
        ├── Local Studio product picker
        ├── docs / catalog
        └── product prove / graduate gates
```

Hand-maintained parallel lists are release bugs waiting to happen.

---

## 7. Bottlenecks (priority)

| # | Bottleneck | Evidence | Impact |
|---|---|---|---|
| 1 | Prebuild independence not enforced | Local Studio: ~20 `file:` deps leaving app root | Blocks resale / extract |
| 2 | Manifest readiness can lie | `source_scaffold=ready` but scaffold command missing | Metadata untrusted |
| 3 | Multiple product registries | manifests + presets + wizard list + installable cache | Picker/docs drift |
| 4 | “Scaffold” means two things | CMS starter vs full product extract | Proof vs UX disagree |
| 5 | Product proof optional | CAD PASS; others FAIL while we keep shipping features | Enforcement unused |
| 6 | Machine not on every app | Local Studio UTF-8 panic in `agentsam-machine` frontend.rs | Deterministic path unhardened |
| 7 | Machine not in npm pack | CLI advertises `agentsam machine`; tarball omits `native/agentsam-machine` | Works in monorepo only |
| 8 | Ecommerce outside architecture test | Real manifest; law names only three apps | Major product escapes law |
| 9 | Local Studio integration monolith | Root packages + CMS sibling internals | Hard to extract |
| 10 | Site seeds ↔ theme packages unproven | `apps/*-site` ∥ `packages/theme-*` | Customer template drift |
| 11 | Doctor shallower than prove | Ecommerce doctor “healthy” while prove fails | Healthy ≠ portable |
| 12 | Package vs app class fuzzy | database-editor under `packages/` | Need product-class in catalog |

---

## 8. Existing tooling (use it; don’t rebuild it)

| Tool | Role |
|---|---|
| `agentsam app validate` | Graduation gate: private vs npm claims, bins, files allowlist, escaping deps |
| `agentsam product proof` / prove script | Isolated scaffold + npm pack + world inspect + JSON receipt |
| `agentsam inspect` | Deterministic repo/world scan (prefer clean-room after extract for portability) |
| `agentsam machine inspect` | Native perception + evidence under `.agentsam/machine/runs/` — must pass every `agentsam.app.json` |
| `agentsam app doctor` | Local health — **not** a substitute for prove |
| Brand / theme / starter packs | Rebrand & customer-template pipeline (compose with Machine) |
| Portable migrations | Identity / product schema packs for SQLite + D1 |

**Release gate (add):** every CLI command advertised by the packed SDK must work from the **actual npm tarball** outside this repository.

---

## 9. Site → theme → customer app pipeline

```text
apps/<customer>-site   (donor)
        ↓
agentsam machine inspect
        ↓
extract brand / content / layout
        ↓
packages/theme-<customer>-site
        ↓
starter pack
        ↓
new apps/<product> or customer instance
```

Declare and prove the relationship so `apps/church-site` and `packages/theme-church-site` cannot silently drift.

---

## 10. Work sequencing (standing)

```text
DONE     Branch closure + Identity branding (#81 @ c6a1519c+)
DONE     PRODUCT_LIFECYCLE.md SSOT
DONE     0c PROJECT AUTHORITY / TOOL INTEGRITY (#83 @ a6dee86d)
DONE     0d CI TRUST / DEPENDENCY CLOSURE (#85 @ 821d0d3e)   ← GHA green
DONE     1 IDENTITY PORTABILITY (#86 @ 99044cfc)             ← GHA green
  │
  ▼
2 DESKTOP TRANSPORT / PACKAGING                             ← NEXT
  │
  ▼
3 DATABASE STUDIO (user-scoped resources)
  │
  ▼
4 SETTINGS HOST
  │
  ▼
PREBUILD GRADUATION
Local Studio / CMS / Ecommerce / CAD
```

Identity / Desktop / Database / Settings work **must not** deepen monorepo-only `file:` coupling or lie in manifests.  
Lane **0d** made install/verify gates enforceable from a clean checkout; do not reopen dependency-graph or bootstrap debt in later lanes.

| Lane | Focus | Graduation constraint |
|---|---|---|
| **0c** Project authority — **DONE** | Describe **this** repo’s architecture from evidence | #83 / `a6dee86d`: customer fixture + FNF regression + packed-npm proof green |
| **0d** CI trust / dependency closure — **DONE** | Make the repo's own gates executable and meaningful from a clean checkout | #85 / `821d0d3e`: clean Install + complete lock graph + `npm run verify` + GHA green |
| **1** Identity portable contract — **DONE** | SQLite + portable D1 + IAM compat | #86 / `99044cfc`: pack + three adapters + packed-npm proof; GHA [36781550250](https://github.com/SamPrimeaux/agentsam-sdk/actions/runs/36781550250) green |
| **2** Desktop transport | Authenticated `/api` bridge + packaging | Desktop uses session transport — not Sam’s D1 credentials |
| **3** Database Studio | Bound vs OAuth vs local; user-scoped | Empty state guides **user123** — never platform owner fallback |
| **4** Settings host | Real host, not fixtures | Settings remains published capability; no permanent repo-local `file:` |

**Standing truth Lane 0c made true and future lanes must preserve:**

> Running AgentSam in an unrelated customer repository describes and uses **that** repository’s actual architecture, not assumptions inherited from the AgentSam SDK monorepo.

**Resale test (standing):**

```text
git clone / npm install SDK
  → agentsam app scaffold <product>   # or graduate install path
  → change brand / companySlug / data
  → run
```

…must become boringly reliable. CAD already shows it is possible.

---

## 10b. Lane 0c — Project authority + machinery integrity

Merkle / repository discovery is **not** the rewrite target (FNF: ~900 files, ~46.6 MB, ~0.66s, correct Git root/revision).  
Failure is **after** discovery: AutoRAG / status / scopes treat the customer project like a blank SDK clone.

### Authority stack → PROJECT CONTEXT RECEIPT

```text
CURRENT REPOSITORY
│
├── Git root / revision                 ← Merkle already correct
├── nearest .agentsam/app.json
├── agentsam.app.json
├── wrangler.toml / wrangler.jsonc
├── .agentsam/knowledge.json            ← AgentSam policy (optional)
├── existing knowledge / generation evidence
└── authenticated provider capabilities
          │
          ▼
  PROJECT CONTEXT RECEIPT
          │
          ├── observed              (bindings, indexes, apps present)
          ├── explicitly selected   (knowledge policy choices)
          ├── locally executable    (runs in this CLI/Desktop process)
          ├── remotely executable   (Worker / hosted binding)
          └── missing / conflicting (drift between policy and wrangler)
```

Truthful example shape (FNF-class):

```json
{
  "vectorize": {
    "configured": true,
    "binding": "FNF_VECTORIZE",
    "index": "fnf-agentsam-bge-m3-1024",
    "source": "wrangler.toml"
  },
  "workers_ai": {
    "configured": true,
    "binding": "AGENTSAM_WAI",
    "local_execution": false,
    "worker_execution": true
  },
  "autorag": {
    "policy_configured": false,
    "suggested_backend": "cloudflare_vectorize"
  }
}
```

Do **not** collapse “no `.agentsam/knowledge.json`” into “this project has no AI/vector resources.”  
Offer adoption of **observed** wrangler resources instead.

### `knowledge.json` vs wrangler

| File | Owns |
|---|---|
| `.agentsam/knowledge.json` | **WHAT** AgentSam wants (scope includes, embedding model, backend **binding** name) |
| `wrangler.toml` / `wrangler.jsonc` | **WHAT RESOURCE** that binding maps to (`index_name`, account, …) |

Do not repeat `index_name` in ten places. If both specify it, **doctor detects drift**.

### `cloudflare_vectorize` = one backend, two transports

| Transport | How |
|---|---|
| Cloudflare Worker | `env.<BINDING>.query` / `.upsert` |
| Local CLI / Desktop | User Cloudflare OAuth → Vectorize HTTP API |

Same logical backend id. Matches the Desktop service-vs-OAuth split used elsewhere.

### Gaps Lane 0c closes (verified)

| Current behavior | Why wrong |
|---|---|
| `repository_intelligence` requires root `packages/agentsam-repository` | Customer repos must not vendor SDK internals to own CLI capability |
| AutoRAG only reads `.agentsam/knowledge.json` | Ignores wrangler / manifest / binding evidence |
| Default code scope = `packages` + `src` | Omits real product under `apps/` (FNF) |
| `cloudflare_vectorize` advertised `supported: true` while adapter incomplete | Label ≠ backend |
| codebaseindex: Vectorize “recorded… follow-up slice” | Not a completed backend |
| Workers AI `operational:false` despite Worker binding | Must separate local vs worker execution |
| Machine panics on Local Studio `\u{a0}` | Every `agentsam.app.json` must survive `machine inspect` |

### Acceptance tests — DONE in #83 / `a6dee86d`

1. **Customer fixture** with `apps/my-product/`, wrangler `[ai]` + `[[vectorize]]`, `.agentsam/app.json` → correct resource discovery (no FNF-specific code in SDK).  
2. **`agentsam autorag setup`** in that fixture proposes the **existing** Vectorize binding — not unrelated OpenAI/Gemini/local defaults.  
3. **`agentsam machine inspect`** passes on **every** `agentsam.app.json` product (incl. Local Studio + arbitrary valid Unicode).  
4. **Packed npm SDK clean-room proof** compiles/runs Machine outside the monorepo.

FNF regression on merged main now resolves canonical repo identity, current local generation, local SQLite, Workers AI, Vectorize, D1, and R2 with no resource conflicts. Preserve that behavior in later lanes.

---

## 10c. Lane 0d — CI trust + dependency closure

Lane 0c is complete, but the repository baseline is still knowingly red. Do **not** start a large Identity change while CI cannot distinguish a new regression from existing install/verify debt.

Verified at `a6dee86d`:

- PR #83's GitHub Actions dependency-health artifact is incomplete because the root lock graph is missing **54 transitive Radix edges under `packages/agentsam-nav`**.
- From a truly clean checkout with no `node_modules`, the current CI wrapper `node src/security/cli.mjs run --json -- npm ci` can import the Merkle/TypeScript stack before dependencies are installed and fail before `npm ci` runs.
- A plain `npm ci` succeeds; once dependencies exist, the security wrapper runs and exposes the real dependency-health findings.
- Existing verify debt remains: stale CMS/scaffold expectations and source-boundary violations already present on pre-0c main.

### Lane 0d rules

This was a **baseline-repair sprint**, not a dependency-upgrade free-for-all.

Proven on the Lane 0d branch:

- Security `run` defers Merkle/TypeScript scan imports until after the child install command.
- Workspace lock graph repaired so `agentsam-nav` Radix edges resolve; `npm --prefix packages/agentsam-nav run build` passes after clean `npm ci`.
- Bounded upgrades: vitest `^4.1.11`, sharp `^0.35.5`, esbuild override `0.28.1`; no `npm audit fix --force`.
- Stale CMS scaffold/tenancy tests updated to current implementation authority (`adapter-ready`, lean sqlite scaffold, live `(apps)/cms.tsx`).
- Source-boundary debt closed by moving `machine-binary` beside the machine command and relocating flat root tests under `test/integration/`.

### Done when

1. Fresh checkout / no `node_modules` can execute the CI Install step successfully. **PASS**
2. Dependency-health receipt is complete and has no unexplained lock-graph gaps. **PASS** (`security run` surfaces child `npm ci` failures before Merkle/TS import)
3. `npm run verify` is green from that install. **PASS** (CMS dist ensure + repo `bin` on PATH for env loader)
4. Remaining app/runtime jobs in `.github/workflows/ci.yml` run rather than being skipped behind Install/Verify failure. **PASS** (Go Cloudflare dry-run optional branch only when `CLOUDFLARE_ACCOUNT_ID` is set)
5. GitHub Actions is green on the Lane 0d PR. **PASS** — run [36775673676](https://github.com/SamPrimeaux/agentsam-sdk/actions/runs/36775673676) @ `821d0d3e`
6. No product behavior, provider support, or portability contract is weakened merely to satisfy CI. **PASS**

`security run` control law (0d): child command executes with bootstrap-safe imports only; on nonzero child exit, emit `command-failed` receipt and **do not** import the Merkle/TypeScript security stack.

Only then proceed to Lane 1 Identity portability.

### Standing runtime law (record only — do not implement in 0d / Lane 1)

`agentsam.runtime.v1` is the stable contract. Language is an implementation detail behind capabilities.

| Concern | Rule |
|---|---|
| INSTANCE | Which machine (Mac / VM / sandbox) |
| ADAPTER | What executes (`agentsamd` / ExecOS / `cloudflare_sandbox` / future) |
| TRANSPORT | How reached (localhost / CF Tunnel / VPC / service binding) |
| AUTH | Why this caller may use it |

Local Studio same-machine path: Tauri → loopback → `agentsamd`. No VPC, Tunnel, Worker, or Durable Object required for local PTY. Remote reachability is optional per enrolled `terminal_connection` (machine-scoped transport, never one tunnel per PTY). PTY/session/process lifetime belongs on the execution host — do not make a Durable Object the PTY authority. ExecOS remains supported; do not delete or replace it in these lanes.

---

## 10d. Lane 1 — Identity portability — **DONE**

Branch: `lane-1-identity-portability` from clean main `a5d58c0a347eaee4be2ca2fd1717acb0ae304643`.  
Merged: PR [#86](https://github.com/SamPrimeaux/agentsam-sdk/pull/86) @ `99044cfcb14930f7bdcb6f1769aa20ed8abf8430` (merge commit `1b075a53`).  
CI: [36781550250](https://github.com/SamPrimeaux/agentsam-sdk/actions/runs/36781550250) **PASS** (verify, 4m22s) on PR HEAD `99044cfc`.

**Product law:** IdentityStore behavior + schema-pack ownership are product authority. SQLite, D1, and IAM are adapters. Do not make Cloudflare/IAM table names the portable contract. Do not create a second Desktop OAuth authority. Do not rename/rebuild production IAM schema merely to match portable names.

### Done when (acceptance — proven)

- [x] Formal `agentsam.identity` pack manifest exists (`packages/identity/schema/agentsam.identity/manifest.json`)
- [x] Generic `agentsam.schema-pack.v1` JSON Schema lives under `protocol/database/` (not Identity-owned)
- [x] Portable SQL has one SSOT: `packages/identity/migrations/sqlite/`
- [x] Clean SQLite uses portable `identity_*` schema
- [x] Clean portable D1 uses the same portable `identity_*` schema
- [x] IAM compat maps the same IdentityStore behavior onto existing hosted schema
- [x] `createCloudflareD1Adapter` remains a stable IAM-compat alias
- [x] Company / native / provider-connection behavior is contracted (not adapter-only magic)
- [x] Password recovery stays storage-agnostic (`createPasswordResetService` + injected store) — proven against all three adapters; **no** mandatory `identity_password_reset_tokens` in core
- [x] Generic customer D1 scaffold emits portable pack SQL (not IAM-shaped `accounts`/`oauth_states` masquerading as portable)
- [x] Required root package exports exist (sqlite / portable-d1 / iam-compat / cloudflare-d1 / identity-store)
- [x] Fresh install path: `001 → 002 → 005` (+ optional oauth-server) → `schema_version=2`
- [x] Upgrade path: existing `schema_version=1` → apply `005` → `schema_version=2` with prior rows still usable
- [x] npm-packed external user123 proof passes (no monorepo escape / operator bleed)
- [x] Existing IAM + Local Studio OAuth regression passes (native-oauth-handoff + identity package suite)
- [x] `npm run verify` passes
- [x] GitHub Actions on final PR HEAD is green — run [36781550250](https://github.com/SamPrimeaux/agentsam-sdk/actions/runs/36781550250) @ `99044cfc`
- [x] This lifecycle section records exact CI evidence; Lane 1 → **DONE**

### LANE 2 WORKBENCH LAW (record only — do not implement until Lane 2 starts)

- Installed Tauri auto-starts/attaches `agentsamd`
- No normal raw pairing-token prompt
- Cmd+J opens real bottom workbench: Problems | Output | Terminal | Ports | Debug
- Terminal means real PTY on selected execution host
- Scratch/virtual shell can exist only as explicit Demo/Tutorial
- Trails are work/chat sessions, not Worker observability
- Worker logs come from real observability/tail authority

### LANE 3 DATABASE STUDIO LAW (record only — do not implement in Lane 1)

- Database Studio is GUI over the same future DataSourceRegistry, schema-pack, doctor and inspect machinery as `agentsam db`
- SQLite is one source, not universal database authority
- Production rows are evidence, never shippable seed material
- `.sqlite` is binary and must never be treated as a text document
- No platform-owner datastore fallback
- Do **not** build DataSourceRegistry in Lane 1 — `agentsam.schema-pack.v1` is enough for Identity

---

## 11. Definition of “graduated”

A product may claim `source_scaffold = ready` / graduate / appear as a first-class installable only when a current receipt says:

- [ ] manifest validate PASS  
- [ ] app architecture law PASS (or explicit non-graduated class)  
- [ ] machine inspect PASS (incl. UTF-8 / parse)  
- [ ] no personal leakage PASS  
- [ ] no escaping `file:` deps PASS  
- [ ] SQLite + D1 schema packs PASS (as claimed)  
- [ ] scaffold isolation PASS (complete product extract)  
- [ ] npm tarball install PASS  
- [ ] doctor from clean install PASS  
- [ ] frontend + backend build PASS  
- [ ] Cloudflare dry-run PASS (if claimed)  
- [ ] desktop parity PASS or N/A  

Until then: develop in `apps/`, but **do not** advertise extract/install readiness.

---

## 12. Related docs

- [apps/README.md](../apps/README.md) — product app ownership boundary  
- Branch closure trail (IAM): `inneranimalmedia/docs/platform/BRANCH_DISPOSITION_20260930.md`  
- Work plan: Cursor `identity_portability_status` — **Lane 1 Identity DONE** (#86 @ `99044cfc` / main `1b075a53`); next is Lane 2 Desktop transport
- Lane 0c project authority merged in #83 at `a6dee86d`; preserve its customer-repo/runtime discovery contract in every later lane
- Lane 0d closes clean-checkout CI trust; do not reopen ExecOS/terminal implementation during Identity
- Runtime protocol note: ExecOS remains supported working machinery; `execos_legacy` is a compatibility identifier, not an approved retirement decision
- Schema-pack protocol: `protocol/database/agentsam.schema-pack.v1.schema.json` (generic); Identity owns `packages/identity/schema/agentsam.identity/manifest.json` only
