# AgentSam — delivery closure and evidence contract (owner development policy)
Status: active · Applies to InnerAnimalMedia-owned development branches, worktrees and releases.
Not a mandatory default bundled into unrelated customers' installations.
Authority: `AGENTSAM.md`, repository architecture, IAM policy, Experience Standard.

## One source branch, one finished outcome
1. Before beginning: `git fetch origin --prune`, inspect `main`, `git status --porcelain`, `git worktree list --porcelain`, open PRs, and related prior branches. Resume the existing branch when work overlaps. Never reset/discard unrelated changes.
2. During work: commit meaningful implementation and tests on the same focused branch. Expose actual user capabilities through existing services and registries. Do not create a replacement app, a second authorization system, or a synthetic capability just to close a checklist.
3. Before review: prove the real journey plus recovery/error/permission paths. Capture raw, labeled evidence. A passing build or isolated test is *implemented*, not *shipped*.
4. After merge: verify the landed commit is reachable from `origin/main`. A merged commit without a hosted deploy is *merged*, not *deployed*. An untested deploy is *deployed*, not *release-ready*.
5. Before "shipped": verify target deployment identifier/URL, smoke the actual authorized host (not Vite or a mock endpoint), and record an acceptance receipt with the source SHA, deployed revision, date, tested route, and failures. Declare gaps by scope.
6. Close out before switching tasks: scan the sibling worktrees; remove each clean, fully merged worktree and its merged local branch with Git's ordinary safe delete. If dirty, ahead, or diverged: preserve and report; never force prune/reset. Check remote PR branches explicitly before remote deletion.
7. If work is deliberately experimental, label it `prototype/not-integrated`; link the canonical destination and don't present it as shipping progress.

## Hard wording gates
- **Implemented:** code exists and is committed, not necessarily visible anywhere.
- **Verified:** tested behaviors have traceable evidence against the stated source revision and runtime.
- **Merged:** commit is reachable from the canonical `main`.
- **Deployed:** deploy receipt references a revision containing the merged commit.
- **Shipped/release-ready:** actual product journey on that deployment passes the project's relevant acceptance checks. Never infer from a green PR.
- **Blocked:** disclose the precise failing gate and preserve recoverable work.

## Capture grammar
`<PROJECT>--<STORY>--<NN>--<STEP>--<YYYYMMDD>--<SOURCE_SHA>--<DEVICE>.<ext>`.
Every recording is at most 29 seconds, raw media is retained, and a machine-readable
`manifest.json` identifies time spans, shot labels, journey phase, commit, route, viewport,
result, failure markers, and simulated-vs-real distinctions. Captures are editor-ready,
not documentation-only. Keep secrets, private tokens and unrelated personal content out.

## Audit & safe prune
Run `node scripts/git/delivery-closure.mjs` to audit. Pass `--prune-merged`
only after a merged PR is confirmed and no sibling is actively working in the tree.
The tool refuses dirty and unmerged worktrees by default; it does not delete remote branches.
