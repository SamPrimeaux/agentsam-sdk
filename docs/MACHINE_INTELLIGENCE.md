# Machine Intelligence — AgentSam ladder

**Status:** Scaffold for Batches A–D (2026-09-24 plans).  
**Authority:** `AGENTSAM.md` · work orders in `docs/plans/UNIVERSAL-INGEST-MACHINE-FIRST-2026-09-24.md` and `docs/plans/MACHINE-FIRST-APPS-TUI-2026-09-24.md`.

**Intent:** Audit and strengthen worlds in place. Do not redesign the repo around package purity. Proof = real `apps/*` + harvested sites — not toy demos.

---

## Product scales (MINI / APP / WORLD)

```text
MINI  — tiny local artifact, instant preview, seconds
        → agentsam mini (see docs/MINI.md)
        → intentionally tiny utility lane — not architectural proof

APP   — complete packaged product (npm install / agentsam app add), minutes
        → Clack catalog: Preview · Info · Doctor · Scaffold/Add · Deploy
        → maturity-gated actions

WORLD — arbitrary repo/path → deterministic world-state → progressive normalize
        → agentsam inspect [path]
        → Merkle + snapshot + AST + brand + harvest + verify + next
```

---

## Maturity ladder (calculated, observable)

Imperfection is maturity state, not exclusion. Prefer calculated facts over hand labels.

```text
harvested → scaffolded → wired → verified → releasable → production
```

| Stage | Gate examples (facts, not badges) |
|-------|-----------------------------------|
| harvested | dir exists; optional gallery/canonical paths |
| scaffolded | package.json / wrangler / preview root present |
| wired | bin + commands.preview/doctor resolve |
| verified | doctor + app contract / boundary checks pass |
| releasable | verify receipts green; no donor junk in publish set; secrets marked |
| production | deploy receipt / remote binding evidence |

---

## Decision primitives (AgentSam-owned)

**Not** TypeSafe/Jev product vocabulary. Native choose / score / check live under `src/sam/decision/` (see `docs/architecture/SAM_DECISION_WORK_RECEIPT.md`).

| Primitive | Role |
|-----------|------|
| predicate / check | yes/no with support |
| choice | discrete option |
| score | ordered magnitude (raw estimate unless calibrated) |
| distribution | deferred / optional |

**Confidence ≠ risk.** Confidence answers “how sure are we?” Risk answers “how bad if wrong?” Abstention and hierarchical degrade are policy, not UI chrome.

Decision receipts (target shape): `{ input_hash, primitive, result, confidence, risk?, next }` — protocol under `protocol/sam/decision-receipt.v1.schema.json`.

First acceptance path: ≥1 classification (e.g. maturity gate or brand route) emits a receipt **without** a model.

---

## World-state

Converge existing slices into one inspectable envelope (extend `repository.snapshot` or add `world.state`):

- files / hashes / MIME (snapshot + merkle)
- AST / routes / APIs
- brand packet (when present)
- app manifest + provenance
- verify receipts
- maturity + next_actions

`agentsam inspect` must work for arbitrary paths **and** every `apps/*`.

Consumers: Brand Intelligence, apps catalog, local gallery, progression next-actions. LLM is one handler inside AgentSam — only on ambiguity.

---

## Explicit non-goals

- Repo redesign for package purity
- New toy/demo apps as architectural proof
- Requiring finished status before inclusion
- TypeSafe/Jev dependency or product vocabulary
- Mini as showcase / poster framing
- Auto-fetch remotes / auto-delete orphans / execute imported HTML
- Jump every path to Level-4 LLM

---

## Acceptance (machine-first, without a model)

1. List every `apps/*` with calculated maturity + provenance + verify status  
2. `agentsam inspect` a harvested site and a serious app → world-state  
3. Answer what / where / contents / capabilities / reusable / missing / verified / next from receipts  
4. Expose decision primitives + a confidence-policy receipt on ≥1 classification path  
5. Keep `agentsam mini` working as the tiny lane  
6. Docs state this ladder + MINI / APP / WORLD (this file)

---

## Related docs

| Doc | Role |
|-----|------|
| `docs/plans/UNIVERSAL-INGEST-MACHINE-FIRST-2026-09-24.md` | Locked work order (Batches A–D) |
| `docs/plans/MACHINE-FIRST-APPS-TUI-2026-09-24.md` | Apps Clack catalog + batch detail |
| `docs/plans/TOMORROW-MACHINE-FIRST-BRIEFING.md` | Review index for next session |
| `docs/MINI.md` | Mini lane |
| `docs/architecture/SAM_DECISION_WORK_RECEIPT.md` | Decision layer ship receipt |
| `docs/BRAND_INTELLIGENCE.md` | Consumer of world-state |
| `docs/REPOSITORY_INTELLIGENCE.md` | Snapshot / inspect substrate |
| `docs/THEME_REFINERY.md` | Harvest ladder + sites |
| `protocol/INSPECT_VIEWS_V1.md` | Inspect views |
| `docs/plans/AGENTSAM-INTERACTIVE-UI-REQUIREMENTS.md` | **Canonical** interactive shell contract (`ctrl-c`) |
| `docs/plans/AGENTSAM-INTERACTIVE-UI-REQUIREMENTS-codex-tui-20260919.md` | Observational Codex brief (`esc`) — not the implemented contract |
