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
   `ContentKnowledgeAdapter` and are never source of truth. Rebuildable.

10. **BrandPack remains the canonical CLI-first brand workflow**
    (`agentsam brand ingest|build|preview|optimize|publish` + brand asset
    subcommands). Content adds peer `agentsam content *` over the same
    Asset Core operations.

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
| Competing `BrandPack` + `matchBrand()` in content | FAIL → scrub commit 2 |
| Demo `BRAND_PACKS` + real customer literals | FAIL → scrub commit 2 |
| Duplicate CF Images clients | FAIL → commit 3 |
| Monolithic `ContentProvider` | FAIL → contracts in commit 1; migrate commit 3+ |
| `RagSink` Vectorize/AutoRAG-shaped | FAIL → `ContentKnowledgeAdapter` in commit 1 |
| No `LocalContentHost` | FAIL → contract commit 1; impl commit 4 |
| Fixed UI collections / no `runtime.capabilities()` | FAIL → contract commit 1; UI commit 5 |
| R2 Data Catalog as media registry | PASS (absent) |
| `.bundle` | DEFERRED (repository package) |

---

## Machine-enforced production gates (target)

`verify` / package verify MUST reject:

- real customer literals in generic `src/`
- app-specific routes in generic packages
- host names in package contracts
- direct secret reads from React/UI
- direct Tauri / raw `fs` imports in reusable UI / browser graph
- duplicate BrandPack authority outside agentsam-brand
- duplicate CF Images transport
- permissive `allowAll` as production default (tests/demo only)
- account-unscoped stores
- fixed provider tabs / fixed intelligence backend
- fake local runtime / Demo product configuration in packages

Commit 1 adds contracts + documents these gates. Enforcement lands with
authority scrub / verify hooks in later commits.

---

## Normalize commit series

| Commit | Scope | Explicitly out |
|---|---|---|
| **1** | Asset Core · ContentBrandResolver · ContentKnowledgeAdapter · capability split · LocalContentHost · `runtime.capabilities()` · account/permission boundary types | No app host wiring · no OAuth · no provider client migration · no demo wiring · no `.bundle` |
| **2** | Authority scrub: remove parallel BrandPack; fictional fixtures | Host UI |
| **3** | Shared CF Images (and related) transport extract | Host mounts |
| **4** | LocalContentHost host-side boundary (Tauri/agentsamd behind) | App screens |
| **5** | Generic Content Studio UI consumes `runtime.capabilities()` | App-specific mounts |
| **6** | Host mounts: Local Studio · IAM · F&F | — |
| later | `.bundle` in agentsam-repository | — |

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

**STOP host mounts until commit 1 contracts are stable.** Next: commit 2 authority scrub.
