# Post-Cursor WIP reconciliation ledger — 2026-11-01

Disposition rule: every WIP gets **integrated**, **superseded** (verified), **safely removed after comparison**, or **blocked** with a named reason.

## Checkpoint — what shipped vs what is accepted

| Workstream | Disposition | Evidence | Acceptance |
| --- | --- | --- | --- |
| Agent 2 Media/nav spine | **Integrated** on `main` + live | PR #415 → `17cfcbc7`, CF `c6d2c1db…` | Routes/redirects verified unauth; **authenticated click-through still outstanding** |
| Agent 1 CF discovery APIs | **Integrated** on `main` + live | PR #417 → `958a26b2`, CF `7b1cfa1b…` | Discovery OK; **gallery acceptance blocked by #419** |
| Deploy proof docs | **Integrated** | PR #420 | Docs only — not product completion |
| Media Library user OAuth gallery | **Blocked → fixing now** | Issue **#419** | Must work with `IAM_API` disabled |
| Theme `/settings/general` vs `/settings/themes` | **Integrated code; verify outstanding** | Agent 2 commits | Need authenticated theme stickiness proof |
| Database Studio | **Blocked** | Issue **#418** | Separate lane after OAuth/media acceptance |
| Token refresh + multi-account | **In local WIP / finishing with #419** | `credential.js` uncommitted | Required for durable OAuth gallery |
| Project attach/detach | **Partial** | Gallery tab links only | Not accepted |
| MovieMode creative loop | **Partial** | Routes + footer cleanup | Editor E2E + `/edit` 301 outstanding |
| Drive listing | **Blocked** | named gap | After CF gallery |
| FlexFit / Monaco / desktop polish | **Deferred P1** | — | After web Media + theme acceptance |
| CMS / Commerce convergence | **Deferred P2** | — | After shell + media |

## Local WIP / stashes (must not be forgotten)

| Item | Disposition |
| --- | --- |
| Uncommitted `content-media-api.js` OAuth list path | **Integrating** into #419 fix |
| Uncommitted `cfoa` credential refresh + multi-account | **Integrating** with #419 |
| Uncommitted `database-editor` Monaco WIP | **Preserve** — belongs to #418; do not mix into media PR |
| Copro/ecommerce `dist/` churn | **Ignore / do not commit** unless intentional release |
| `stash@{0}` post-agent1 deploy artifacts | Build noise — drop after confirm |
| `stash@{1}` wip-before-agent1-pr-merge | Compare vs main before drop |
| Older theme/CMS/workbench stashes | Explicit compare pass after #419/#418 |

## Sequence (unchanged)

1. Finish + accept web Media (#419) and shell/theme proof  
2. Reconcile OAuth credential authority (shared with #418)  
3. Database Studio #418  
4. Worktree ledger prune with dispositions  
5. FlexFit / desktop acceptance  

## Definition of done (corrected)

A route + green CI is **not** done. Done requires the authenticated user workflow with real provider data, including the regression: **CF gallery with `IAM_API` absent**.
