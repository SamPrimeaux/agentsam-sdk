# Content Studio revision gate — SSOT lock + normalize plan

**Acceptance sentence (every package):**

> Could this exact capability be consumed tomorrow by Local Studio, IAM,
> Fuel & Free Time, and an unknown customer app without modifying the package?

If the answer is no because of branding, routes, credentials, storage, RAG,
or a hardcoded provider — it is not finished.

---

## REPLACE THE OLD INVARIANT

**OLD (retired — do not use):**

> Content owns assets. BrandPack owns brand meaning. Providers own bytes.

**LOCKED SSOT:**

1. **Account/Auth** owns identity, tenancy and permissions.

2. **Shared Asset Core** (`@inneranimalmedia/agentsam-assets-core` /
   `protocol/assets/`) owns canonical asset identity (`ast_*`), machine facts,
   provenance and provider **representations**.

3. **BrandPack** (`brand.pack.json` / `@inneranimalmedia/agentsam-sdk-brand`)
   owns the canonical brand system **AND brand-scoped assets**: logos, icons,
   fonts, imagery, video, models, themes, styles, tokens, motion, semantic
   roles and brand delivery rules. BrandPack does **not** own physical storage
   implementation — representations live on providers via Asset Core.

4. **Content** (`@inneranimalmedia/agentsam-content`) owns general
   content/library concerns: lifecycle, collections, CMS imports, generated
   content, live/draft state, page/product usage and non-brand organization.

5. **BrandPack and Content are PEER domains** over shared Asset Core.
   Neither owns the other. One photograph may be both a BrandPack
   `image.hero` and a Content live `/about` usage of the same `ast_*`.

6. **Providers own representations/transport only**: R2 keys, CF Image IDs,
   Stream UIDs, Drive IDs, local handles. Provider identity is never
   canonical asset identity. Deleting a provider object ≠ deleting `ast_*`.

7. **Local is a first-class** source/storage/execution environment
   (`LocalContentHost`), not a cloud fallback.

8. **Host runtime** supplies credentials, capabilities and provider adapters
   (Local Studio, IAM, F&F, customers — each different).

9. **Knowledge/vector/RAG** systems are **derived indexes** via host-injected
   `ContentKnowledgeAdapter` / `BrandSimilarityAdapter` and are never source
   of truth. Rebuildable. Matching may use embeddings, but never imports a
   host vector backend into Content/Brand packages.

10. **BrandPack remains the canonical CLI-first brand workflow**
    (`agentsam brand ingest|build|preview|optimize|publish` + brand asset
    subcommands). Content adds peer `agentsam content *` over the same
    Asset Core operations. **Brand inference is not BrandPack authority** —
    see Brand matching law below.

11. **Every GUI operation** must map to a reusable programmatic operation
    and CLI surface (same operation contract).

12. **Every CLI operation** must be callable through the same operation
    layer used by GUI and agents.

13. **No production feature** is accepted if it requires an app-specific fork.

14. **No generic package** may contain real customer/product presets,
    credentials, routes or provider assumptions.

15. **Compiled ZIPs, previews, R2 copies, CF Images variants and exports**
    are projections/materializations — not SSOT. `brand.pack.json` remains
    BrandPack SoT.

16. A feature is not finished until: contract · CLI · GUI can consume same
    operation · tests · account scope · local behavior where relevant ·
    injectable providers · documentation identifies authority.

### Domain authority table

| Domain | Single authority | Owns |
|---|---|---|
| Identity/account | auth/account runtime | `account_id`, actor, permissions, ownership |
| Asset identity | Asset Core | `ast_*`, hashes, provenance, representations, revisions |
| Brand | `brand.pack.json` / agentsam-brand | brand system + brand-scoped assets/roles/rules |
| General content | agentsam-content | library lifecycle, collections, CMS/usage |
| Storage/delivery | provider adapters | bytes/refs only |
| Local machine | LocalContentHost | FS handles, watch, native processing |
| Jobs/events | AgentSam runtime | durable work, receipts, activity |
| Knowledge | host-injected adapter | derived Vectorize/AutoRAG/pgvector/SQLite/… |
| Brand inference | Content intelligence (proposals only) | association proposals with evidence/confidence |
| Harvest productization | SiteGraph / TokenGraph → proposals | Theme/Template/Section/Component candidates |
| UI | Studio/CLI | clients of shared operations — never a second implementation |

### Peer shape (not a stack)

```
        Asset Core (ast_*)
           ↑          ↑
      BrandPack     Content
           │          │
           └────┬─────┘
                ▼
     Content Studio / Brand Studio / CLI / Agent tools
```

### Brand matching law (authority vs intelligence)

`agentsam-brand` / BrandPack and brand inference **coexist with different jobs**:

| Capability | Job | Authority? |
|---|---|---|
| **BrandPack** | Canonical brand definition (logos, icons, fonts, colors, themes, style, voice, imagery, video, 3D, roles, delivery rules, known assets) | **Yes — truth** |
| **ContentBrandResolver** | Host projection of BrandPack into Content (ids, names, aliases, signal projections). Content must not import agentsam-brand upward. | Projection only |
| **Exact lookup** | `resolveBrand` / `matchKnownBrandId` / `resolver.get(id)` — deterministic id/alias resolution | Lookup against truth |
| **`inferBrandAssociation`** | Intelligence: given unknown asset/content, which known BrandPack does it most likely belong to? | **No — proposal** |

```
                 BrandPack
        canonical brand authority
                     │
                     │ projection
                     ▼
            ContentBrandResolver
                     │
        ┌────────────┴─────────────┐
        ▼                          ▼
exact brand lookup        inferBrandAssociation()
                                  │
                          deterministic signals
                          embeddings / vector
                          optional semantic AI
                                  │
                                  ▼
                         association proposal
                                  │
                          human / AgentSam policy
                                  │
                                  ▼
                    ContentAsset.brandId → BrandPack id
```

**Amended Commit 2 instruction (replaces “remove matchBrand()”):**

> Remove the competing local BrandPack schema/type. Preserve brand inference
> as a reusable intelligence capability. Refactor it to operate on
> projections/candidates obtained through ContentBrandResolver. Matching may
> use deterministic signals, embeddings, semantic retrieval, or host-injected
> intelligence, and must return evidence/confidence rather than establish
> BrandPack authority.

Rename guidance:

- `inferBrandAssociation(asset, candidates, …)` — classification / proposal
- reserve `matchBrand` / `resolveBrand` / `matchKnownBrandId` for exact/resolved lookup if kept
- local mini type becomes `BrandCandidate` / `BrandProjection` (signals only), never `BrandPack`

Multi-stage inference (cheap → expensive):

1. Deterministic: filename, directory, tags, project, source URL/domain, known usage, colors, hash/duplicate, metadata
2. Machine/semantic: image/text embeddings, CLIP-style similarity, OCR, caption embedding, logo / known-asset similarity
3. Optional LLM adjudication only when ambiguous

Host-injected similarity (do **not** import Vectorize/AutoRAG into Content):

```
interface BrandSimilarityAdapter {
  rank(asset: AssetRecord, candidates: BrandProjection[]): Promise<BrandMatchCandidate[]>;
}
```

Hosts may implement with Vectorize, Supabase pgvector, local Ollama+SQLite, or no embeddings.

**Never** silently write inference into BrandPack or treat a keyword mini-registry as brand meaning. Policy acceptance → `ContentAsset.brandId` reference only.

### Semantic token states (observation ≠ truth)

| State | Meaning |
|---|---|
| **OBSERVED** | Literal source evidence (`#0e1015`, `bg-zinc-950`, `var(--surface)`, …) |
| **CANDIDATE** | Inferred semantic normalization (`surface.canvas.dark`, confidence, cluster) |
| **CANONICAL** | Accepted token in a ThemePack / BrandPack / package after review |

Never silently promote OBSERVED/CANDIDATE → CANONICAL.

### Harvest classification taxonomy

Not every scanned site is a BrandPack. Classification targets:

| Kind | Role |
|---|---|
| **SiteProfile** | Evidence for one scanned build — not necessarily installable |
| **BrandPack** | Owner-specific identity |
| **ThemePack** | Reusable visual system (colors, surfaces, type scale, motion) |
| **TemplatePack** | Reusable page/app composition |
| **SectionPack** | Reusable scene/section |
| **ComponentPack** | Buttons, cards, drawers, nav, media viewer, … |

Owner association (repo, customer, commit, paths) stays on evidence; reusable packages may be owner-neutral.

### Harvest pipeline shape (deterministic-first)

```
DISCOVER → PARSE → NORMALIZE → FINGERPRINT → CLUSTER
  → EMBED (only worth comparing) → CLASSIFY → PROPOSE → REVIEW → COMPILE
```

```
                    HARVEST
                       │
       ┌───────────────┼────────────────┐
       ▼               ▼                ▼
    Asset Core      SiteGraph        TokenGraph
       │               │                │
       └──────────┬────┴──────────┬─────┘
                  ▼               ▼
              clustering      semantics
                  │               │
                  └──────┬────────┘
                         ▼
                 Productization
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
         BrandPack    ThemePack   TemplatePack
                                  SectionPack
                                  ComponentPack
```

Go/local runtime owns high-volume deterministic work (walk, hash, MIME, light parse, inventories, checkpoints). TypeScript owns shared contracts/compilers. AI owns ambiguous naming/classification only. Embedding backends remain host adapters over neutral `SemanticArtifact` emissions.

Scan output must produce **actionable proposals** (package-readiness scores, token families, duplicates, section clusters) — not stop at indexes/embeddings. No package becomes canonical without review. CLI and GUI share the same harvest operations.

---

## Severity / product context

Paying customer galleries (e.g. Fuel & Free Time) underperform vs the donor
gallery that already includes R2, Google Drive, Cloudflare Images, tagging,
editing, multi-size variants, and inspect. The same portable gallery must
serve **at least three hosts without forks**:

1. Fuel & Free Time (customer)
2. Inner Animal Media platform dashboard
3. AgentSam Local Studio

Plus video gallery dual-use (Stream delivery + R2 masters), in-app AgentSam
create/edit/post → organize/tag/document → host knowledge adapters so brands
and sites actually learn. Quality, load, and display performance are
first-class acceptance criteria — not polish.

Portability gate: if a host difference (storage, OAuth, RAG, routes, brand)
forces a package change, the seam is wrong.

---

## Audit snapshot (pre-normalize)

| Field | Value |
|---|---|
| Worktree | `/Users/samprimeaux/agent-worktrees/content-studio-audit` |
| Branch | `audit/agentsam-content-studio-transplant-20260927` |
| Base head | `28ef451` (transplant on main) |
| Brand audit | `/tmp/agentsam-brand-authority-audit.json` |
| Provider audit | `/tmp/agentsam-provider-authority-audit.txt` |
| Status | Contracts normalize in progress; **not** host-ready |

### Pre-normalize FAIL highlights (still true until later commits)

| Issue | Status |
|---|---|
| Competing local `BrandPack` type in content (+ demo keyword packs) | FAIL → commit 2 scrub schema; **keep** inference as `inferBrandAssociation` |
| Real customer literals as brand-authority fixtures | FAIL → scrub commit 2 (fictional fixtures only) |
| No ScoreCard / independent score families | FAIL → scoring package + gate section |
| Duplicate CF Images clients | FAIL → commit 3 |
| Monolithic `ContentProvider` | FAIL → contracts in commit 1; migrate commit 3+ |
| `RagSink` Vectorize/AutoRAG-shaped | FAIL → `ContentKnowledgeAdapter` in commit 1 |
| No `LocalContentHost` | FAIL → contract commit 1; impl commit 4 |
| Fixed UI collections / no `runtime.capabilities()` | FAIL → contract commit 1; UI commit 5 |
| R2 Data Catalog as media registry | PASS (absent) |
| `.bundle` | DEFERRED (repository package) |
| Semantic harvest product loop (SiteGraph / TokenGraph → proposals) | MANDATED — contracts/shape in gate; pipeline impl after normalize series |

---

## SCORING / CALIBRATION REQUIREMENT

Raw evidence is SSOT. Scores are **versioned derived views** — recomputable from
evidence + weight configs. Never treat a ScoreCard as authority over BrandPack,
Asset Core, or OBSERVED tokens.

### ScoreCard contract

```ts
interface ScoreCard {
  id: string;
  kind:
    | "theme-similarity"
    | "brand-affinity"
    | "template-similarity"
    | "section-reuse"
    | "token-consistency"
    | "portability"
    | "package-readiness"
    | "drift"
    | "confidence"
    | "structural-similarity"
    | "reuse";
  score: number; // 0..100
  confidence: number; // 0..1
  algorithm: string;
  weightsVersion: string;
  components: Record<string, { raw: number; normalized: number; weight: number; contribution: number }>;
  penalties: Record<string, number>;
  evidenceRefs: string[];
  computedAt: string;
}
```

Package: `@inneranimalmedia/agentsam-scoring` (+ `protocol/scoring/`).
Content/brand re-export helpers as needed; they do **not** own scoring SSOT.

### Rules

1. **Independent score families** — NEVER one grand `similarity_score`.
2. **Weights in versioned config files** (`weights/brand-affinity.v1.json`,
   `weights/package-readiness.v1.json`, …) — not scattered magic constants.
3. **Deterministic first**; embeddings via injected adapters; LLM last.
4. **Human accept/reject calibrates recommendations** (Beta / outcome receipts).
   Calibration does **not** mutate deterministic evidence.
5. Export helpers for `brand_affinity` / `package_readiness` v1 even when the
   harvest pipeline is incomplete.
6. `inferBrandAssociation` returns ScoreCard-shaped **brand-affinity** evidence
   (proposal only — never BrandPack authority).

### brand_affinity v1 weights

| Component | Weight |
|---|---|
| known-asset | 0.30 |
| logo/mark | 0.20 |
| names/domains/metadata | 0.15 |
| palette | 0.10 |
| typography | 0.10 |
| imagery-style | 0.10 |
| contextual usage | 0.05 |

### package_readiness v1 weights

| Component | Weight |
|---|---|
| recurrence | 0.22 |
| structural | 0.18 |
| portability | 0.16 |
| token coverage | 0.14 |
| responsive | 0.10 |
| stability | 0.08 |
| framework independence | 0.07 |
| testability | 0.05 |

Minus penalties (owner-specific literals, hardcoded routes, secrets, host
coupling, silent CANONICAL promotion, …).

---

## SEMANTIC HARVEST / PRODUCTIZATION REQUIREMENT

The Asset/Content/Brand architecture must support future bulk harvesting of
large local codebases **without introducing another parallel schema**.

AgentSam must be able to scan arbitrary HTML, CSS, JS/TS/TSX, Vue/Svelte,
theme/config files, and media references, and emit normalized evidence for:

- semantic design tokens
- layout primitives
- page structure
- reusable sections / components
- animation/motion patterns
- typography systems
- media roles
- asset references

Token processing preserves **OBSERVED → CANDIDATE → CANONICAL** (never silent
promotion). Brand identity and reusable visual/theme systems are separate
concepts (BrandPack ≠ ThemePack).

Bulk pipeline is deterministic-first (discover → parse → normalize →
fingerprint → cluster → then embeddings / semantic inference). Go/local
runtime handles high-volume deterministic scanning where useful.
Embedding/vector/RAG is host-injected.

Outputs must cause action: reusable section/theme/template candidates, token
normalization opportunities, duplicated assets, near-duplicate components,
package-readiness scores, owner-specific literals blocking extraction.
Every proposal preserves provenance (repo, commit, path, symbol/DOM, owner/app).
No package is generated as canonical without review/approval.
CLI and GUI use the same scan and proposal operations.

Target ROI shape (example): scanned N projects → theme families, section
families, shells, real brands, duplicate assets, package candidates above a
readiness threshold — not merely “indexed lines of code.”

---

## Machine-enforced production gates (target)

`verify` / package verify MUST reject:

- real customer literals in generic `src/`
- app-specific routes in generic packages
- host names in package contracts
- direct secret reads from React/UI
- direct Tauri / raw `fs` imports in reusable UI / browser graph
- duplicate BrandPack **schema/authority** outside agentsam-brand
  (brand **inference** proposals are allowed; mini BrandPack registries are not)
- duplicate CF Images transport
- permissive `allowAll` as production default (tests/demo only)
- account-unscoped stores
- fixed provider tabs / fixed intelligence backend
- fake local runtime / Demo product configuration in packages
- silent promotion of OBSERVED/CANDIDATE tokens to CANONICAL without review

Commit 1 adds contracts + documents these gates. Enforcement lands with
authority scrub / verify hooks in later commits.

---

## Normalize commit series

| Commit | Scope | Explicitly out |
|---|---|---|
| **1** | Asset Core · ContentBrandResolver · ContentKnowledgeAdapter · capability split · LocalContentHost · `runtime.capabilities()` · account/permission boundary types | No app host wiring · no OAuth · no provider client migration · no demo wiring · no `.bundle` |
| **2** | Authority scrub: remove competing local BrandPack schema/type; refactor brand inference → `inferBrandAssociation` on resolver projections + evidence/confidence; fictional fixtures only; optional `BrandSimilarityAdapter` seam; **ScoreCard foundation** (`agentsam-scoring`) | Host UI · full harvest pipeline · embedding backends |
| **3** | Shared CF Images (and related) transport extract | Host mounts |
| **4** | LocalContentHost host-side boundary (Tauri/agentsamd behind) | App screens |
| **5** | Generic Content Studio UI consumes `runtime.capabilities()` | App-specific mounts |
| **6** | Host mounts: Local Studio · IAM · F&F | — |
| later | `.bundle` in agentsam-repository · harvest SiteGraph/TokenGraph productization CLI/GUI | — |

**“NO host UI” clarification:** commit 1 must not modify
`apps/local-studio/...`, IAM dashboard routes, or F&F admin screens.
**Generic** `packages/agentsam-content-studio` may change for contracts/types
only — no app-specific behavior.

---

## GUI ↔ CLI law

```
                 operation contract (Asset Core + domain)

drag/drop ──────┐
file picker ────┤
Studio button ──┤
CLI filepath ───┼──→ asset.ingest / brand.asset.* / content.*
stdin ──────────┤
URL / Drive ────┤
Agent tool ─────┘
```

A GUI-only capability is incomplete. A CLI-only capability that cannot be
surfaced programmatically is incomplete. Intake normalizes to
`AttachmentIntake → AssetInput → operation`.

---

## Normalize commit 1 checklist

- [x] Rewrite this gate with locked SSOT (this document)
- [x] `@inneranimalmedia/agentsam-assets-core` + `protocol/assets/`
- [x] `ContentBrandResolver` / brand projection (not BrandPack schema)
- [x] `ContentKnowledgeAdapter` (neutral; RagSink → adapter shim)
- [x] Capability-split adapter contracts (source / storage / delivery / video)
- [x] `LocalContentHost` + availability states
- [x] `runtime.capabilities()`
- [x] Account-scoped actor/permission boundary types on runtime config
- [x] No app host wiring / demo / OAuth / `.bundle`

**STOP host mounts until commit 1 contracts are stable.** Next: commit 2
authority scrub (**keep** brand inference; remove competing BrandPack schema)
+ ScoreCard foundation.

### Normalize commit 2 checklist

- [x] Remove competing local `BrandPack` type → `BrandCandidate` / `BrandProjection`
- [x] `inferBrandAssociation()` returns proposal + brand-affinity ScoreCard
- [x] Optional `BrandSimilarityAdapter` seam (no Vectorize/AutoRAG in content)
- [x] Exact lookup reserved via `ContentBrandResolver.get` / `matchKnownBrandId`
- [x] Fictional fixtures only in demos/tests
- [x] Content does not import agentsam-brand for brand meaning
- [x] `@inneranimalmedia/agentsam-scoring` + protocol/scoring + gate SCORING section
- [x] Tests for ScoreCard compute + explainability + brand association

### Normalize commit 3–5 targets

- [x] Shared CF Images transport (`@inneranimalmedia/agentsam-cloudflare-images`)
- [x] LocalContentHost host-side stubs (memory / attachable seams)
- [x] Content Studio UI derives provider/capability chrome from `runtime.capabilities()`
- [x] Mount checklist for Local Studio / IAM / F&F (commit 6 / Path B)