# SAM Decision Layer — Work Receipt

**Package:** `@inneranimalmedia/agentsam-sdk`  
**Scope:** AgentSam-native choose / score / check (no TypeSafe/Jev)  
**Date:** 2026-09-25

## Files changed

### Core
- `src/sam/decision/` — types, state, validate, confidence, questions, evaluate, policy, receipt, calibration, hierarchical
- `src/sam/decision/evaluators/` — deterministic, heuristic, semantic, select
- `src/sam/operations/decision-evaluate.js`
- `src/sam/seed.js`, `src/sam/index.js`, `src/sam/client.js`
- `package.json` — protocol subpath exports

### Protocols
- `protocol/sam/state.v1.schema.json`
- `protocol/sam/question.v1.schema.json`
- `protocol/sam/answer.v1.schema.json`
- `protocol/sam/evaluation.v1.schema.json`
- `protocol/sam/decision-receipt.v1.schema.json`
- `protocol/sam/outcome.v1.schema.json`
- `protocol/sam/calibration.v1.schema.json`

### Tests
- `test/integration/sam-decision.test.mjs` (35 cases) + A*/GOAP remain green

## Evaluators implemented
| Kind | Status |
|------|--------|
| deterministic | terminal_lane, retrieval_mode, change_risk, requires_approval, security_review_required, verification_scope, skill_candidate |
| heuristic | fact-backed score/check |
| semantic | optional via `createSemanticEvaluator({ complete })`; fails closed if unconfigured |
| calibrated-statistical | deferred (contract + metrics only) |

## Decision use cases
1. **terminal_lane** — local files + healthy local → `local`
2. **cross-cutting change fan-out** — risk / approval / sandbox / security / verification_scope in one batch
3. **skill_candidate** — OAuth migration → `mcp-oauth`

## Raw vs calibrated semantics
- Default labels: `scores`, `support`, `confidence_estimate`
- `probabilities` only when evaluator marks probabilistic interpretation
- `calibrated_probability` requires `calibration_id`
- Semantic answers always warn: estimates, not calibrated probabilities

## Intentionally deferred
- Learned classifiers / held-out training
- Go `/v1/sam/evaluate` host
- Live Merkle/filesystem decision signals
- IAM `attach_token_hash` rename (not present in agentsam-sdk; IAM-side)

## Auth note (architecture only)
`AGENTSAM_API_KEY` ≠ terminal attach token. Prefer `attach_token_hash` naming on IAM terminal sessions when that sprint lands.
