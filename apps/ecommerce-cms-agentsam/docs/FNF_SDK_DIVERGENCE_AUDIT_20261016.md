# Ecommerce CMS source-divergence audit — 2026-10-16

## Evidence and scope

Compared the two **clean** local workspaces, excluding node_modules/dist/build/.git/.wrangler/.next:
- FuelNFreetime `main` at `034b0fc`: `apps/ecommerce-cms-agentsam` (452 files)
- AgentSam SDK local feature branch `feat/copro-dockable-workspace-20261016` at `695ff80e`: `apps/ecommerce-cms-agentsam` (373 files)
- 70 same-path exact SHA-256 matches; 146 changed same-path files; 236 FNF-only; 157 SDK-only.

**Caveat:** SDK local worktree was on a feature branch, not `main`. This is a working-tree audit, not a confirmed branch-to-branch upstream merge diff. Before code migration repeat on fresh remote refs with explicit commit SHAs.

## Conclusions

FNF contains substantially more current full-stack CMS implementation and tests. SDK copy must not be treated as the release authority, despite version `2.6.12` in package.json. No automatic overwrite/merge is safe. Target is one customer-neutral, portable SDK app derived from FNF's tested implementation, preserving genuinely shared SDK adapters/exports.

## File-family matrix

| Area | FNF-only | SDK-only | Same-path changed | Same |
|---|---:|---:|---:|---:|
| backend | 58 | 1 | 65 | 16 |
| frontend | 43 | 10 | 76 | 54 |
| CMS authoring | 4 | 0 | 0 | 0 |
| db | 8 | 0 | 0 | 0 |
| tests | 40 | 0 | 0 | 0 |
| packages | 56 | 0 | 0 | 0 |
| apps | 5 | 0 | 0 | 0 |
| bin | 5 | 1 | 0 | 0 |
| shared | 0 | 29 | 0 | 0 |
| templates | 0 | 2 | 0 | 0 |
| theme | 3 | 0 | 0 | 0 |

## Merge order and non-destructive rules

1. Pin clean commit SHAs and create a **separate integration worktree** for SDK. Preserve current SDK app as a git tag/archival branch and a file hash manifest. No edits to live FNF `main`.
2. Promote FNF's authoritative CMS writer and tests as a coherent unit: `backend/cms/{canonical-composition,composition-contract,definition-registry,generated-block-repository,generated-section,page-authority,setting-contract,theme-authority,theme-style-contract}`, `cms/authoring/*`, `cms/block-types.json`, `db/*`, and associated `tests/*`.
3. Promote FNF's app registry, route authority, backend tool capability contracts, media/product flows, and security tests together. Do not copy FNF tenant seed data, branding, production account IDs, mail defaults, secrets, or Cloudflare bindings into the reusable SDK package.
4. Preserve and reconcile SDK-only `shared/{assets,commerce-analytics,media-kit}`, `frontend/cms` public adapter and `frontend/theme-editor/remote-worker-adapter.mjs`, and `templates/*`. Do not overwrite these without callsite/type/bundle verification.
5. For 146 same-path modified files, perform a deliberate 3-way integration against ancestry or module-level cherry-picks, never `cp -R` over the SDK tree.
6. Resolve product packaging conflict: FNF `@inneranimalmedia/ecommerce-cms-agentsam@0.2.0` is `private:true`, has comprehensive build/test tools; SDK `@inneranimalmedia/ecommerce-cms-agentsam@2.6.12` is public with additional dependencies and exports. Choose package version from **release policy and tested content**, not max(version). Preserve public export paths after integration.
7. Verify clean install, standalone scaffolding, tenant isolation, CMS page add/edit/reorder/reload/revision restore, media handling, product studio, route map, auth, tool scopes, mobile QA, and live preview. Do not mark deployment-ready on only unit tests.
8. Update `agentsam_products` after verified package release and deploy evidence. The recently updated SDK registration `2.6.12` reflects a manifest, **not** FNF implementation parity.

## Immediate acceptance command proposal

- Run full FNF app tests in a clean isolated checkout with the declared Node version.
- Run SDK's existing CMS and app tests separately.
- Validate the packaging surface against the same cross-tenant fixture, including export APIs and customer-neutral defaults.
- Run exact-file hash inventory before and after integration, and report every deleted/replaced file.
- Publish an integration PR only after differences are categorized and acceptance gates pass.

## Status

**Audit evidence collected; file migration, integration branch merge, end-to-end verification, deployment and SSOT transfer NOT executed.**
