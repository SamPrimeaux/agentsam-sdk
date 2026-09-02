# SDK branch consolidation — 2026-09-02

Archive tags preserve the exact source heads. Removing a branch name does not remove its
tagged commit history. `git switch --detach <tag>` inspects it; `git switch -c <new-name>
<tag>` restores a working branch when its deferred work is selected.

| Original branch | Head commit | Disposition / archive tag |
| --- | --- | --- |
| `feat/portable-knowledge-index` | `08c5320423f1c4a687a653cb77262bf1d6fac066` | Merged by PR #20; `archive/2026-09-02/feat/portable-knowledge-index` |
| `feat/knowledge-docker-service` | `7b4f35032c139377a258e31aa473eb8a44e23198` | Merged by PR #21; `archive/2026-09-02/feat/knowledge-docker-service` |
| `feat/knowledge-sdk-foundation` | `480a1a634af974d96fb11716dc85932d04c47aca` | Recovered/superseded by PR #20; `archive/2026-09-02/feat/knowledge-sdk-foundation` |
| `codex/sdk-execution-spine` | `2a25563150ff1ecaf2a879f0256230dc11cfff87` | Preserved for selective future extraction; `archive/2026-09-02/codex/sdk-execution-spine` |

The old knowledge foundation's schemas, JS/Python transport contracts and tests are already
recovered. Its YAML manifest and empty parser/ranking protocols are preserved at the
tagged commit, not presented as implemented capabilities. Full mapping:
[knowledge branch recovery](knowledge-branch-recovery.md).

## Execution branch: value and remaining defects

The execution branch contains 15 unique non-merge commits, approximately 603 added lines
across 12 files relative to its merge base. It must not be merged wholesale into the
current SDK. Findings are based on its exact tagged head, not just its age.

| Source files | Value | Disposition before a stable release |
| --- | --- | --- |
| `src/core/ToolResult.js`, `ToolRunner.js` | Consistent result envelopes, timing, handler registration and error normalization | Retained in archive. `requiresApproval` is listed as metadata but never enforced by the runner; any future extraction needs an explicit host policy contract. |
| `src/tools/local/doctor.js`, `src/commands/status.js` | Local environment diagnostics | Current `src/commands/status.js` + `src/lib/local-status.js` already implement Git/DB/API/PTY status. The old doctor uses a stale Node >=20 check, returns raw project config, and has an incorrect package.json import path. |
| `src/tools/cloudflare/client.js`, `inventory.js`, `src/commands/cloudflare.js` | Read-only account inventory and a CLI entry point | Deferred. Reader has no request timeout/pagination, treats object-shaped results such as R2 buckets as empty arrays, and reports `ok:true` even when every collector fails. Requires a complete/partial result contract and current API tests. |
| `src/AgentSam.js` changes | Tool registration and programmatic invocation | Deferred with the runner. The added HTTP `/api/agentsam/tool` route has no authorization gate and auto-registers local filesystem diagnostics; not suitable for the portable HTTP helper's default surface. |
| `src/index.js`, `src/cli.js` changes | Public exports and command dispatch | Old dispatch would collide with current status and adds Node-only diagnostics to the Worker-facing helper. Reconcile only when the underlying adapters are ready. |
| `test/smoke.mjs`, `docs/EXECUTION_SPINE_MAP.md` | Usage examples and original design intent | Preserved in the archive. Tests mostly exercise missing credentials and a publicly callable local doctor, not successful complete inventory or authorization. |

These are deferred implementation candidates, not lost features. Main retains the working
status implementation and does not advertise the archived Cloudflare inventory command.
