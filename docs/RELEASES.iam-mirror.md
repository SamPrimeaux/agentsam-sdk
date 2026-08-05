# Agent Sam SDK — release pairings (IAM home)

**Status:** Evergreen receipts · **Product:** [README.md](./README.md)

Canonical npm-side table also lives in the SDK repo: `docs/RELEASES.md`.  
**Keep both updated** when publishing (dual-home of the receipt).

| npm version | Published (UTC) | IAM git SHA (40) | Notes |
|-------------|-----------------|------------------|-------|
| 1.7.0 | 2026-07-14 | _(pre-receipt)_ | Prior publish |
| 1.9.0 | _(pending publish)_ | `fc1628505cb3c9946c149e4c468c2e264d6f381e` | `repository.inspect` + `--dupes`; mirrored from IAM agentsam-sdk |
| 1.8.0 | 2026-08-02T13:57:12.080Z | `580547301e370b77ec26bd72558979d335feedd9` | `python/` + `protocol/` in tarball; `repository.scan_bloat`; shell-kit under `packages/` |

**Latest pairing (ready to publish):** `iam@fc1628505cb3c9946c149e4c468c2e264d6f381e` ↔ `@inneranimalmedia/agentsam-sdk@1.9.0`

### Receipt rules

- Full 40-char SHA only (AGENTS.md §3)
- Record the IAM SHA that introduced or mirrored the consumer-facing change
- Tag SDK repo `vX.Y.Z` on publish
