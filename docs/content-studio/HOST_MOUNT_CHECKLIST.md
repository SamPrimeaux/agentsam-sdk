# Host mount checklist — Content Studio (Path A / Commit 6)

Portable packages are ready for host adapters. Full OAuth / production mounts
are Path B / host-app work — do **not** fork packages per host.

## Shared mount contract

Each host supplies a `ContentRuntime` via `createContentRuntime({...})`:

| Seam | Local Studio | IAM dashboard | Fuel & Free Time (customer) |
|---|---|---|---|
| `account` / `actor` | desktop session | IAM auth session | customer tenant session |
| `providers` / capability adapters | local + optional CF | R2 / Images / Drive / Stream | customer-scoped providers |
| `brandResolver` | project BrandPack projection | org BrandPack projection | customer BrandPack projection |
| `knowledge` | local / injected | host Vectorize/AutoRAG/pgvector | customer knowledge adapter |
| `localHost` | Tauri / agentsamd bridge | usually `unavailable` | usually `unavailable` |
| `routes` / `permissions` | desktop RouteMap | IAM RouteMap | customer RouteMap |
| UI | `<ContentStudio runtime={rt} />` | same | same |

## Do

1. Build runtime in the **host** app (not inside `agentsam-content-studio`).
2. Derive UI tabs/actions from `await runtime.capabilities()`.
3. Keep BrandPack authority in `agentsam-brand` / `brand.pack.json`.
4. Use `inferBrandAssociation` only as proposals + ScoreCard evidence.
5. Use `@inneranimalmedia/agentsam-cloudflare-images` for CF Images HTTP.

## Don't

- Import Tauri / raw `fs` / agentsamd into reusable UI packages.
- Hardcode R2 / Images / Drive / Vectorize tabs in Content Studio.
- Embed real customer BrandPack fixtures in generic packages.
- Seed fictional `DEMO_BRAND_PROJECTIONS` into production `/content` runtimes.
- Run IAM `deploy:full` from this SDK repo for content-studio work.

## Local Studio mount (wired)

- Route: `/content` → `ContentStudioPage` mounts `<ContentStudio runtime={…} />`
- Runtime factory: `apps/local-studio/frontend/src/lib/content/createLocalStudioContentRuntime.ts`
- **Identity:** resolved from `useCurrentUserState()` / Auth session — fail closed when missing.
  No `acct_local_studio` / `local-studio-user` production defaults.
- **Brand:** empty `ContentBrandResolver` projections until host injects BrandPack (Path B).
  Fictional demos live only in `demoBrandProjections.ts` (tests/examples).
- **LocalContentHost (desktop):** native Rust Tauri `local_content_bridge` —
  `rfd` pickers, opaque `localref_*` / `localdir_*`, granted roots, browse in place,
  copy only on `import_to_library`. **Does not require** monorepo Node or global Node.
- **LocalContentHost (browser/dev):** File System Access API when available; else
  explicit browser-import (`import_bytes`, 32 MiB) via Node `/api/content/local/bridge`.
- Knowledge / BrandSimilarity: noop adapters (no Vectorize hardcode)
- agentsamd: probed via Tauri `ensure_agentsamd` / health; FS ops are native Rust until
  agentsamd ships native `/v1/fs` (documented migration target)

## Packaged-app contract

| Requirement | Status |
|---|---|
| Works from `/Applications` without repo checkout | Native Rust FS — yes |
| No global Node for content FS | Desktop native — yes; Node bridge is browser/dev only |
| Native Open File / Open Folder | `rfd` via `pick_files` / `pick_directory` |
| Selected file not copied until import | Yes — `import_to_library` is separate |
| Opaque refs only to UI/models | Yes — absolute paths stay in Rust/grant store |

## Remaining for true 3-host E2E (Path B)

- agentsamd native `/v1/fs` + watch (migration from native Rust bridge)
- IAM dashboard route + OAuth-scoped providers
- F&F admin mount with customer account scope
- Production BrandPack projection into Local Studio `brandResolver`
- Harvest Go pipeline → SiteGraph / TokenGraph → package-readiness ScoreCards
- Brand package migration onto shared CF Images transport (content already uses it)
- Beta / outcome calibration receipts for accept/reject (does not mutate evidence)
