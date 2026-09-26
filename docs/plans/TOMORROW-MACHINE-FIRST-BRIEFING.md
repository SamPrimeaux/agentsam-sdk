# Tomorrow briefing — Machine-first apps / world-state

**Date staged:** 2026-09-26  
**Home:** agentsam-sdk `main`  
**Start here:** [MACHINE_INTELLIGENCE.md](../MACHINE_INTELLIGENCE.md)

This file is the review index for the next work session. Plans that lived only under `.cursor/plans/` are now copied into `docs/plans/`.

---

## Acceptance checklist (do these)

Without a model, AgentSam can:

1. List every `apps/*` with calculated maturity + provenance + verify status  
2. `agentsam inspect` a harvested site and a serious app → world-state  
3. Answer what / where / contents / capabilities / reusable / missing / verified / next from receipts  
4. Expose decision primitives + a confidence-policy receipt on ≥1 classification path  
5. Keep `agentsam mini` working as the tiny lane  
6. Docs state machine-first ladder + MINI / APP / WORLD → **done scaffold:** `docs/MACHINE_INTELLIGENCE.md`

### Non-goals

- Toy demos as proof  
- Auto-fetch remotes  
- Execute imported HTML  
- TypeSafe vocabulary  
- Repo redesign for package purity  
- Hiding imperfect apps  
- Mini as architectural poster  

### Interactive UI note

| File | Role |
|------|------|
| [AGENTSAM-INTERACTIVE-UI-REQUIREMENTS.md](./AGENTSAM-INTERACTIVE-UI-REQUIREMENTS.md) | **Implemented contract** — interrupt = `ctrl-c` |
| [AGENTSAM-INTERACTIVE-UI-REQUIREMENTS-codex-tui-20260919.md](./AGENTSAM-INTERACTIVE-UI-REQUIREMENTS-codex-tui-20260919.md) | Observational Codex-TUI brief — `esc` / paste notes differ; do not override the canonical file |

Shell interactive work is **separate** from Apps Clack catalog (`agentsam apps`).

---

## Work orders (copied into repo)

| Doc | Role |
|-----|------|
| [UNIVERSAL-INGEST-MACHINE-FIRST-2026-09-24.md](./UNIVERSAL-INGEST-MACHINE-FIRST-2026-09-24.md) | Locked intent, branch hygiene, Batches A–D, acceptance |
| [MACHINE-FIRST-APPS-TUI-2026-09-24.md](./MACHINE-FIRST-APPS-TUI-2026-09-24.md) | Superseding detail: Clack `agentsam apps`, maturity gates, execution order |

**Suggested order:** Batch A (docs + primitives) → Batch B (world-state + maturity) → Batch D1 (Clack menu with stub maturity) → Batch C (ingest) → Batch D2–D3 (distribute + mini framing).

---

## Docs map by acceptance item

### 1–3 · Apps inventory / inspect / receipts

| Path | Note |
|------|------|
| [../MACHINE_INTELLIGENCE.md](../MACHINE_INTELLIGENCE.md) | Ladder + world-state target |
| [../CAPABILITIES.md](../CAPABILITIES.md) | `repository.snapshot` |
| [../MERKLE.md](../MERKLE.md) | Hashes / integrity |
| [../REPOSITORY_INTELLIGENCE.md](../REPOSITORY_INTELLIGENCE.md) | Inspect substrate |
| [../REPOSITORY_KNOWLEDGE.md](../REPOSITORY_KNOWLEDGE.md) | Index / search |
| [../BRAND_INTELLIGENCE.md](../BRAND_INTELLIGENCE.md) | World-state consumer |
| [../THEME_REFINERY.md](../THEME_REFINERY.md) | Harvest ladder + 7 sites |
| [../architecture/SAM_KERNEL.md](../architecture/SAM_KERNEL.md) | `agentsam inspect` |
| [../CLI_SHELL.md](../CLI_SHELL.md) | Shell surface |
| [../../protocol/INSPECT_VIEWS_V1.md](../../protocol/INSPECT_VIEWS_V1.md) | Inspect views contract |
| [../../protocol/README.md](../../protocol/README.md) | APP vs FEATURE |
| `apps/*/agentsam.app.json` · `apps/*/.agentsam/app.json` | Manifests (product + harvested) |
| `apps/*/IMPORT_PROVENANCE.json` | Provenance where present |
| `protocol/theme-refinery/receipts/*` | Harvest / registry receipts |

### 4 · Decision primitives + confidence

| Path | Note |
|------|------|
| [../architecture/SAM_DECISION_WORK_RECEIPT.md](../architecture/SAM_DECISION_WORK_RECEIPT.md) | Shipped choose/score/check (no TypeSafe) |
| [../architecture/SAM_ACTIVITY_RECOVERY_RECEIPT.md](../architecture/SAM_ACTIVITY_RECOVERY_RECEIPT.md) | Activity stream (in-memory store today) |
| `protocol/sam/decision-receipt.v1.schema.json` (+ state/question/answer/evaluation/calibration/outcome) | Schemas |
| `src/sam/decision/` | Implementation |
| Site twin: `apps/frontend/public/site/docs/sam/structured-decisions/` | Field manual HTML |

### 5 · Mini

| Path | Note |
|------|------|
| [../MINI.md](../MINI.md) | `agentsam mini` lane |

### 6 · Ladder + MINI/APP/WORLD

| Path | Note |
|------|------|
| [../MACHINE_INTELLIGENCE.md](../MACHINE_INTELLIGENCE.md) | **SSOT for framing** |

---

## Current `apps/*` surface (proof targets)

| App | Kind signal |
|-----|-------------|
| `cad-creator` | product — `agentsam.app.json` |
| `client-cms-editor` | product |
| `ecommerce-cms-agentsam` | product |
| `local-studio` | product |
| `church-site` … `shinshu-site` (7) | harvested — `.agentsam/app.json` |
| `theme-gallery-preview`, `frontend`, `project-control`, `agentsam-go-worker`, `_incoming` | maturity TBD via calculated gates |

---

## Code touchpoints (do not rebuild)

| Piece | Path |
|-------|------|
| CLI router / `app` alias | `src/cli.js` |
| App commands | `src/commands/app.js` |
| Inspect / snapshot | `src/commands/product.js` → `src/capabilities/repository-snapshot.js` |
| Progression / next | `src/progression/engine.js` |
| Decision | `src/sam/decision/` |
| Clack patterns | `src/ui/cli/help.js` (+ `@clack/prompts`) |
| Verify | `scripts/verify-package.mjs`, `scripts/verify-source-boundaries.mjs` |

---

## Secondary context (not the work order)

- [NEXT-AGENT-HANDOFF.md](./NEXT-AGENT-HANDOFF.md)  
- [RECONCILIATION-2026-09-19.md](./RECONCILIATION-2026-09-19.md)  
- [MULTI-AGENT-SPRINTS-2026-09-19.md](./MULTI-AGENT-SPRINTS-2026-09-19.md)  
- [../architecture/SAM_MACHINE_NORMALIZATION_PRECOMMIT_REPORT.md](../architecture/SAM_MACHINE_NORMALIZATION_PRECOMMIT_REPORT.md)  
- [../DEPLOY_RECEIPTS.md](../DEPLOY_RECEIPTS.md)  

Ignore: `~/Downloads/TOMORROW-AGENT-SAM-FIX.md` (unrelated Shinshu dashboard).

---

## First slice when you sit down

1. Skim `MACHINE_INTELLIGENCE.md` + this briefing  
2. Confirm decision receipt path still green: `node --test test/integration/sam-decision.test.mjs` (or project equivalent)  
3. Expand `listAppManifests` to include `.agentsam/app.json` + bare `apps/*` dirs  
4. Stub calculated maturity on `agentsam app list --json`  
5. Wire ≥1 maturity/brand path through existing decision primitives → receipt  
6. Smoke: `agentsam mini templates` still works  
