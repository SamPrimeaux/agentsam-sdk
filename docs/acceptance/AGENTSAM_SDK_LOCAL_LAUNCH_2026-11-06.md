# AgentSam SDK — verified source + local npm launch receipt

2026-11-06/07 UTC. Repository: SamPrimeaux/agentsam-sdk. This is an **execution receipt**, not a claim of npm publication or a fully finished product.

## Accepted code/runtime outcomes

- Source-owned Tauri `native-events` capability remains tracked; generated ACL/schema files are ignored and reconstructible. The four original diff files and patch were backed up with checksums at `/Users/samprimeaux/agent-audits/agentsam-sdk-tauri-schemas-20261106`.
- `cargo check --manifest-path packages/agentsam-desktop-shell/src-tauri/Cargo.toml -q` passed, including the native notification plugin.
- `npm --prefix apps/local-studio run build:desktop` and `npm run launch:check` passed; browser desktop smoke mounted Local Studio; native PKCE/session contract smoke passed.
- `npm run launch` was actually exercised on Sams-iMac: Tauri compiled and ran `target/debug/agentsam-desktop-shell`. The test launcher shut down the dev process after verifying startup; it did not leave a background dev server running.
- Global `agentsam_tools` definitions now resolve through account-owned enabled installations. Multiple account installations do not duplicate tools; disabled and cross-account tools are excluded. Runtime rejects caller account mismatches. SQLite authorization tests and composer projection tests passed.
- Source presentation recovery from PR #477 and plugin projection/launch from PR #479 are merged into `main`; both temporary worktrees and their branches were removed after verifying source equivalence.
- D1 `inneranimalmedia-business` migration ledger is now current: 1345, 1346, 1347, 1349, 1352, 1353 applied by the native Wrangler migration runner with automatic backup, and `wrangler d1 migrations list --remote` reports **no migrations to apply**. The 1349 migration preserved 8 prior metric records in `project_metrics_legacy_20261028` and normalized 8 rows in `project_metrics`.
- 16 global Gmail tools are associated with the Google Gmail OAuth plugin. The account installation remains intentionally disabled; no consent, connection state or account preference was silently elevated.
- Two remaining merch-package security/portability tests were recovered from older branch work and pass against the **more complete** current source. Older branch source changes that removed modern assortment recipes and geometry tests were not merged.

## Dependency and release block (NOT accepted)

- Root source manifests and desktop/Studio versions are aligned on 2.6.14; npm public registry still serves 2.6.13 for `agentsam-sdk`, `agentsam-workbench` and other 2.6.14 release-train packages.
- GitHub CI jobs `release-build` and `verify` fail on `ETARGET No matching version found for @inneranimalmedia/agentsam-workbench@2.6.14`. This is a dependency publication/ordering failure, **not proof the locally built desktop failed**. Fix the release train rather than pinning old 2.6.13 packages.
- On the authorized Mac, `npm whoami` returned E401. No usable npm publishing credential is available to this execution session. No 2.6.14 npm packages were published. Do not label the public install or signed installer as accepted.
- Signed/notarized .app/.dmg distribution and external clean `npm ci` are NOT accepted. The Tauri dev binary launched locally, but a signed public release has not been verified.

## Explicit outstanding WIP dispositions

- Prior release worktree `fix/sdk-ci-desktop-release-lockstep-20261105`: no commits ahead of `main`; two dirty 2.6.13 downgrades were proven superseded by 2.6.14 release alignment. Original diff and checksums saved at `/Users/samprimeaux/agent-audits/agentsam-sdk-release-worktree-20261106`. Worktree and branch removed.
- Route diagnostics worktree and plugin finishline worktree: code merged via PR #477 and #479, equality verified, then removed. No unrelated dirty changes discarded.
- `feat/commerce-cms-editor-shell-20261028`: original Cloudflare Images pagination is already in `main`; modern collection/merch code is a verified superset; its missing collection tests were ported and passed. Archived at Git tag `archive/reconciled-merch-cms-20261028`; obsolete branch removed.
- `feat/widget-platform-donor-graduation-20261005`: **unaccepted intentional WIP**. The donor widgets/haptics/gesture implementation has not passed canonical portable package, live data adapter and public consumption gates. Retain branch; graduate only source with real adapters and tests into `packages/agentsam-workbench/src/widgets`, not a duplicate prototype package.
- Active `feat/financial-provider-mobile-connect-flow-20261106` worktree/PR #480 belongs to another active agent and was not changed.
- Eight older Git stashes remain, **not dropped**. They include Tauri menus/tray/media (#0), database editor (#1), CMS/theme/terminal (#2), project review (#3), CAD/native pet (#4), CAD reports (#5), historic donor/theme work (#6) and desktop icon (#7). Their contents have NOT all been accepted into current products. Review each at its app boundary with tests rather than applying blindly.

## Exact launch commands (source checkout with installed dependencies)

```bash
cd /Users/samprimeaux/agentsam-sdk
npm run launch:check  # passes: desktop build + browser/PKCE smoke
npm run launch        # passes: Tauri dev binary starts; opens native Studio
npm run launch:web    # existing Local Studio web dev path
```

Local launch is working; **public npm launch from a clean external install is not yet released**. Next blocking dependency: approved authenticated npm publication of the 2.6.14 train, then fresh external `npm ci`/installer validation. Independently, the broader six-sprint product acceptance still requires customer-owned credential authorization and real OAuth/tool execution.
