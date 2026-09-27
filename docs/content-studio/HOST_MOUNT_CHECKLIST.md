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
- Run IAM `deploy:full` from this SDK repo for content-studio work.

## Local Studio mount (wired)

- Route: `/content` → `ContentStudioPage` mounts `<ContentStudio runtime={…} />`
- Runtime factory: `apps/local-studio/frontend/src/lib/content/createLocalStudioContentRuntime.ts`
- `LocalContentHost`: Tauri `local_content_bridge` + Node `/api/content/local/bridge` via
  `createAgentsamdLocalHostSeam` + real FS bridge (not memory-only)
- Brand: `ContentBrandResolver` projections (fictional demos; production via BrandPack host)
- Knowledge / BrandSimilarity: noop adapters (no Vectorize hardcode)
- agentsamd: probed via Tauri `ensure_agentsamd` / health; FS ops via Node bridge until
  agentsamd ships native `/v1/fs`

## Remaining for true 3-host E2E (Path B)

- agentsamd native `/v1/fs` + watch (today: Node bridge + capability probe)
- IAM dashboard route + OAuth-scoped providers
- F&F admin mount with customer account scope
- Harvest Go pipeline → SiteGraph / TokenGraph → package-readiness ScoreCards
- Brand package migration onto shared CF Images transport (content already uses it)
- Beta / outcome calibration receipts for accept/reject (does not mutate evidence)
