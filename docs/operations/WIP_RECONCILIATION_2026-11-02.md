# AgentSam SDK — work-in-progress recovery register
_Date: 2026-11-02. Source: real iMac checkout, Git local refs/worktrees/stashes._

## Read this before cleaning Git

- **In main** means the branch is an ancestor of main. It does **not** mean its active working directory is clean.
- **Compare** means a commit SHA exists only on the branch, often because a feature was squash-merged or rewritten. Compare *behavior and files*; do not cherry-pick automatically.
- **Recover** means the history or uncommitted files contain potentially valuable functionality that must be reviewed against the latest system.
- **Do not delete** anything below until the existing implementation is accepted in the **web** product, required tests pass, and an accountable disposition is recorded.
- The downloaded desktop version 2.6.13 is deliberately out of scope until web acceptance; never ship a native installer to discover whether source changes work.

## All 22 branches found before this recovery pass

| Branch | Plain-English description | Direction |
|---|---|---|
| `integration/studio-shell-cms-main-20261102` | Recoverable snapshot of four shell/CMS feature commits plus 21 previously dirty file entries. Not a clean feature PR; later main has many of its fixes. | **Compare** carefully; preserve snapshot as rollback, not a replacement shell. |
| `fix/desktop-release-rebuild-included-20261102` | Source branch for PR #432 forcing full included-app rebuild before desktop bundling. | **Integrated** by squash; compare once, then eligible for branch cleanup. |
| `feat/moviemode-resource-contract` | PR #427 MovieMode template/editor work is on main, but this is still the primary checkout holding unrelated financial analytics edits. | **Keep** until financial WIP is committed elsewhere; don't delete or reset checkout. |
| `fix/cad-v15-model-status-20261101` | Clarified native BIM versus browser-editable CAD V1.5 status. | **Compare** with main's equivalent CAD fix; likely historical. |
| `fix/cad-v15-scene-edit-20261101` | Fixed hosted CAD V1.5 scene editing and initial revision save. | **Compare** with main's equivalent CAD fix; run editable scene acceptance. |
| `feat/ecommerce-cms-catalog-install-slice` | Adds persistence for installing catalog templates as CMS instances. | **Recover** actual install/activation workflow and tests before merge. |
| `creative/moviemode-batch1-presentation` | Earlier MovieMode presentation integration branch. | **In main by ancestry**; preserve any visual intent in acceptance evidence before cleanup. |
| `feat/samsketch-batch1-presentation` | Earlier SamSketch presentation integration. | **In main by ancestry**; test current UI first. |
| `feat/cad-creator-batch1-presentation` | Earlier CAD Creator presentation integration. | **In main by ancestry**; test CAD editing first. |
| `feat/creative-batch1-shell-integration-20261101` | Creative-suite shared shell presentation integration. | **In main by ancestry**; check unified host behavior. |
| `docs/agent1-media-deploy-status-20261101` | Evidence notes for a web Media deployment. | **In main by ancestry**; archive as historical documentation. |
| `feat/agentsam-media-cf-discovery-20261031` | Media Library / Cloudflare discovery improvements. | **In main by ancestry**; acceptance-test live media resources. |
| `fix/agent2-deploy-smoke-20261101` | Navigation and Media deployment smoke-test work. | **In main by ancestry**; archive only after verifying smoke receipts. |
| `fix/notification-inbox-native-20261031` | Account notification inbox and native-host work. | **In main by ancestry**; test both hosts. |
| `feat/sdk-host-shell-cms-unification-20261029` | Original shell/CMS navigation, themes, identity, packaging feature, with **21 dirty files** still in its worktree. | **Recover** only missing behavior from that worktree; never blind-merge the older implementation. |
| `feat/canonical-sites-products-install-20261029` | Routes website management into canonical ecommerce theme/site flow. | **Review** against the current Online Store and Theme Editor paths. |
| `backup/cad-wave2-pre-rebase-20261028` | Old CAD/DreamHouse BIM, metrics and Work integration with other mixed development. | **Compare/recover** any unique CAD capability; don't restore whole backup. |
| `feat/commerce-cms-editor-shell-20261028` | Merchandising collections, provider integration and Cloudflare Images pagination. | **Review/recover** reusable commerce and product features. |
| `fix/studio-account-work-products-20261026` | Product Studio consolidation and typed Completeful integration. | **Review/recover** product creation and provider SDK where not yet merged. |
| `feat/ecommerce-npm-product-2.6.13-20261018` | Ecommerce installation and packaging into Local Studio. The worktree still has seven dirty entries. | **Keep/reconcile** package manifest, lockfiles and installation rules. |
| `feat/plan-authority-20261015` | Durable plan ledger and approved AgentSam planning operations; worktree still dirty. | **Recover** against current command governance, not by mass cherry-pick. |
| `feat/widget-platform-donor-graduation-20261005` | Experimental widget donor integration and reusable UI infrastructure; worktree still has staged changes. | **Review** platform eligibility; isolate donor code from production. |

## The five original worktrees

| Checkout | Plain-English contents | Uncommitted entries at audit | Next step |
|---|---|---:|---|
| Primary `agentsam-sdk` | MovieMode feature branch, now also holding financial analytics and database editor WIP | 13 | Commit finance work on its own current-main branch; leave original files untouched until captured |
| Ecommerce npm product | Ecommerce packaging, dependency manifests and generated catalog updates | 7 | Reconcile install dependencies with newest ecommerce source |
| SDK shell/CMS unification | Shell, notifications, navigation, themes, identity and CoPro build assets | 21 | Recover missing behavior into main; compare with newer notification/theme implementations |
| SDK planning authority | Capability adapters, planning commands and operation identifiers | 4 | Review authorized planning API and tests |
| SDK widget platform | Workbench dependency changes and donor-widget quarantine checks | 3 | Keep experimental surface isolated until approved |

## All 15 stashes — saved changes, not throwaway trash

| Stash | What it holds in plain English | Direction |
|---|---|---|
| `stash@{0}` | Mixed Media, CoPro generated assets, shell appearance/navigation and terminal runtime edits | **Review source changes**; rebuild generated assets, don't blindly apply |
| `stash@{1}` | Older CoPro and ecommerce builds plus database-editor UI work | **Review database editor source** and compare artifacts |
| `stash@{2}` | Root package dependencies saved during Media discovery work | **Compare** lockfile changes with current install graph |
| `stash@{3}` | CMS content composition, page inventory, theme UI and some CoPro builds | **High-priority recovery review** against canonical CMS |
| `stash@{4}` | Ecommerce package/dependency edits | **Compare** with active ecommerce packaging worktree |
| `stash@{5}` | D1 migration 1349 for project metrics and engine markers | **Check migration history** before ever applying it |
| `stash@{6}` | Generated ecommerce frontend HTML | **Verify source rebuild**, likely stale output |
| `stash@{7}` | Generated app routing and ecommerce HTML from a Home route repair | **Compare route generator**, not just generated files |
| `stash@{8}` | CAD DreamHouse review, project curation, Work service and D1 migration | **High-priority CAD recovery review** |
| `stash@{9}` | CAD OCCT roundtrip, DreamHouse source and Local Studio Home/console changes | **High-priority CAD recovery review** |
| `stash@{10}` | Older CAD contract backups, gap report, registry and pre-release assets | **Audit evidence**; preserve useful diagnostics |
| `stash@{11}` | Generated CoPro/MoveMode JS/CSS bundles | **Compare generated asset hashes**; source is authority |
| `stash@{12}` | Desktop 2.6.12 installable/download manifest files | **Archive historical release proof**; never republish as new |
| `stash@{13}` | Large 235-file theme-prebuild/donor-theme work and CAD export UI | **High-priority recovery review**; distinguish reusable theme engine from fixtures |
| `stash@{14}` | Native desktop icon from 2.6.11 release | **Compare brand source**; preserve rollback reference |

**Stash labels are positional.** If new stashes are added or old ones dropped, `stash@{N}` numbers move. Always use a fresh inventory and compare underlying stash commit IDs before acting.

## Operating contract: no more accidental parallel products

1. **One product, one authority.** Keep the live product's source, registry, auth, routes and storage clearly identified; features enhance existing source in place.
2. **One tracked owner per unfinished feature.** Every nontrivial WIP must have a named branch and an open acceptance item describing what remains.
3. **No unreviewed bulk stash application, branch merges, or folder replacement.** Compare against current main to avoid undoing features already shipped via squash merges.
4. **Web acceptance precedes native packaging.** Verify authenticated routes, visual presentation, project/media isolation and editable workflows before versioning the desktop installer.
5. **No deletion based on Git history alone.** A branch at zero commits ahead of main can still own a dirty worktree. Every stash may contain unique source even if it has mostly generated files.
6. **Acceptance evidence includes** source SHA, build receipt, test results, relevant route/screenshot proof, rollback revision and responsible release target.
7. **Use `npm run wip:audit`** at the beginning and end of each consolidation sprint. It is read-only and enumerates actual local branches, dirty worktrees, and stashes. CI cannot see local-only worktrees/stashes from GitHub, so this audit must run on the developer machine.

## Near-term priority

**P0:** Verify hosted Online Store navigation, restore intentional MovieMode dark/cyan presentation, accept MovieMode source/media workflow, and repair shell continuity before changing the desktop version.

**P1:** Recover distinct CMS/commerce, CAD/OCCT/DreamHouse and financial analytics work against latest main, one feature slice at a time.

**P2:** Close historical branches/stashes only after the new web implementation and source receipts are accepted. Prefer preserving Git history and minimal filesystem/worktree cleanup over creating new project copies.

No destructive cleanups were authorized by this document.
