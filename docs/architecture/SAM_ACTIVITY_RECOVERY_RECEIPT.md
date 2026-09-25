# Sprint receipt — decisions observable + recovery semantics

**Commit target:** agentsam-sdk  
**Scope:** Connect SAM decisions to runs/outcomes/activity; add RecoveryPlan. No new choose/score/check primitives.

## Shipped

### 1. Outcome capture + run linkage
- Receipts carry `run_id`, `step_id`, `action_id`, `outcome_id`
- `attachAction(receipt, action)`
- `appendOutcome` dispositions: accepted / rejected / overridden / corrected_to / retry_required / verification_failed / user_intervened
- `label_strength`: supervised | explicit_accept | weak_passive  
  (passive /why with no correction ≠ strong calibration label)

### 2. Activity stream (`agentsam.activity.v1`)
- `createActivityStore(run_id)` · `activityFromDecision` · `decision.made`
- User-facing labels ("Selecting execution path") — primitives only in `evidence`
- `evaluate({ activity, run_id })` emits events for Studio/CLI subscribers

### 3. Error recovery (not more ERROR_REASON sprawl)
- Optional envelope fields: `failure_class`, `operation.side_effect_state`, `retry`, `fallback`, `notify`, `cause`, partial status
- `planRecovery(error, operationContext)` → `agentsam.recovery.v1`
- **Unknown side effects ⇒ reconcile, never blind retry**

### 4. Protocols
- `protocol/sam/activity.v1.schema.json`
- `protocol/errors/recovery.v1.schema.json`
- receipt/outcome schemas extended
- error-envelope optional recovery dimensions

## Intentionally deferred
- IAM `attach_token_hash` rename + `terminal:connect` on control plane (IAM repo)
- Studio Activity SideStage / Hyperspace canvas wiring (consume activity store next)
- CLI TUI live region
- Go watcher → decision.evaluate loop
- Full ERROR_REASON enum expansion for every FS/PTY string (use failure_class + native evidence)

## Tests
`test/integration/sam-activity-recovery.test.mjs` (+ prior decision/error suites green)
