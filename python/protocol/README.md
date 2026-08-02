# agentsam-sdk protocol (LOCKED)

Every Agent Sam **tool / feature SDK surface** is dual-homed. There is no
“Python audits only in IAM” vs “JS CLI only on npm” split for productized
tooling.

| Home | Path | Role |
|------|------|------|
| **Main platform repo** | `inneranimalmedia/agentsam-sdk/` | Source of truth while building; ships with platform deploy |
| **Published SDK repo** | `github.com/SamPrimeaux/agentsam-sdk` → npm `@inneranimalmedia/agentsam-sdk` | Same contract + modules for external / CLI consumers |

## Rules

1. **Author once, land twice.** New `agentsam_sdk.*` tools (data, repository,
   readiness, history, code-intel, …) land in the monorepo package **and** are
   mirrored into the published `agentsam-sdk` repo in the same change set / PR
   pair. No silent one-sided land.
2. **Contract is shared.** `runtime/contract` (`ToolInput` / `ToolResult` /
   receipts, unixepoch, no hardcoded identity) is the protocol. Language may
   differ (Python stdlib vs JS), but CLI verbs and JSON shapes must stay
   aligned — see `protocol/dual-repo-sync.md`.
3. **No drift.** Publishing npm without updating the monorepo copy (or the
   reverse) is a protocol violation. Gate: version bump + changelog note that
   lists mirrored paths.
4. **Ship is two-sided.**
   - Platform: Mac `npm run deploy:full` / `deploy:fast` (or GCP `ship:remote`)
     when the monorepo copy or Worker wiring changed.
   - SDK: **manual** npm publish / version bump on `agentsam-sdk` after the
     mirror lands (operator-owned — do not assume CI auto-publishes).
5. **Inspiration ≠ copy-paste secrets.** In-app surfaces (e.g. `src/core/code-indexer.js`,
   AST-RAG Phase 1/2) are the reference implementations to port into portable
   SDK modules — strip platform-only bindings, keep adapters for D1 / git /
   Hyperdrive.

## Layout (both homes)

```
agentsam-sdk/
  protocol/           ← this law
  python/agentsam_sdk ← Python portable tools (stdlib-first audits / inventory)
  src/                ← JS CLI / scaffold (published npm entry)
  packages/           ← optional workspace packages (not always in npm tarball)
    agentsam-shell-kit/  ← @inneranimalmedia/agentsam-shell-kit (private until ready)
  docs/gaps.md        ← port status vs IAM scripts + in-app indexers
```

**npm identity (LOCKED):** root publishable package is always
`@inneranimalmedia/agentsam-sdk`. Do not overwrite root `package.json` with a
workspace kit name. Fold UI kits under `packages/*`.

Exact folder names may evolve; the dual-home + root-identity rules do not.
