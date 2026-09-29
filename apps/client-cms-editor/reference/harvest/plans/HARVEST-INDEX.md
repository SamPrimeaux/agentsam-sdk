# Studio CMS Editor Harvest Index

## Purpose

This branch turns `studio-cms-editor` into a donor source, not a new runtime authority.

The goal is to preserve everything valuable enough to repurpose while making it difficult to accidentally drag demo state, fake persistence, production-specific deployment glue, or generated artifacts into AgentSam SDK.

Current source truth included by this harvest branch:

- repository: `SamPrimeaux/studio-cms-editor`
- latest merged source baseline: `origin/main@f0547d7`
- CMS editor: `app/studio/page.tsx`
- shared editor styling: `app/globals.css`
- public storefront implementation: `app/components/Storefront.tsx`
- public storefront data: `app/storefront-data.ts`
- public storefront styling: `app/storefront.css`
- public routes: home, shop, collections, product, journal, story
- ChatGPT-hosted identity reference: `app/chatgpt-auth.ts`
- content implementation plan: `plans/INNERANIMALS-CONTENT-001.md`
- database schema remains intentionally empty

The source is valuable primarily as:

1. a polished CMS/editor interaction donor,
2. a real public storefront/theme/layout donor,
3. a ChatGPT identity integration reference,
4. a historical system example for future AgentSam galleries.

It is **not** assumed to be a functioning production CMS.

## Non-negotiable rule

Installing, auditing, previewing, exporting, or staging this donor must never:

- deploy a Worker,
- run Wrangler deploy,
- sync a website,
- publish a CMS revision,
- upload assets,
- write to D1/R2/KV,
- alter AgentSam SDK runtime packages,
- alter a customer site,
- invoke remote mutations.

Those actions belong to later explicit commands in the target system.

## Harvest lanes

### A. CMS editor UX donor

Primary source:

- `app/studio/page.tsx`
- `app/globals.css`

Keep or adapt the interaction ideas:

- page tree
- section tree
- section reorder
- visibility controls
- component browser
- template browser
- media browser UX
- content inspector
- style inspector
- page/SEO inspector
- theme/token inspector
- click-preview-to-select
- responsive device previews
- command palette
- undo/redo
- HTML import concept
- URL import concept
- page history UX
- publish/schedule UX as UI only

Do not preserve simulated persistence as architecture.

### B. Inner Animals storefront/theme donor

Primary source:

- `app/page.tsx`
- `app/components/Storefront.tsx`
- `app/storefront-data.ts`
- `app/storefront.css`
- `app/layout.tsx`
- public storefront route files

Treat this as candidate source for a future package such as:

`@inneranimalmedia/theme-inneranimals-site`

The harvest export preserves the route/layout/component/data source verbatim. Normalizing it into true section/block contracts happens inside the real CMS/theme implementation, not destructively in this donor repo.

See `plans/STOREFRONT-SURFACE-MAP.md`.

### C. ChatGPT identity donor

Primary source:

- `app/chatgpt-auth.ts`

Preserve the hosted ChatGPT identity pattern as a reference adapter for:

`@inneranimalmedia/agentsam-sdk-identity`

Target architecture:

`OpenAI/ChatGPT hosted identity -> NormalizedExternalIdentity -> AgentSam account linkage`

Do not leak `oai-authenticated-*` headers into generic CMS contracts.

### D. Content-plan/reference donor

Primary source:

- `plans/INNERANIMALS-CONTENT-001.md`

Keep as implementation intent/provenance. It should not override the reusable CMS/theme contracts.

### E. Runtime/deployment reference

Reference-only:

- `.openai/hosting.json`
- `vite.config.ts`
- `next.config.ts`
- `worker/index.ts`
- `worker/vpc.ts`
- `wrangler.production.toml`
- `docs/workers-vpc.md`
- `package.json`

These files explain how the old build ran. They are not candidates for automatic adoption into AgentSam SDK.

## One-shot workflow

From this repo:

```bash
python3 scripts/harvest_audit.py
python3 scripts/harvest_all.py
```

That creates a sibling export by default:

`../studio-cms-editor-harvest-export/`

To stage the curated export inside AgentSam SDK without touching active packages:

```bash
python3 scripts/harvest_all.py \
  --sdk /Users/samprimeaux/agentsam-sdk \
  --stage-sdk
```

The SDK target is:

`apps/_incoming/studio-cms-editor-harvest/`

That directory is intentionally a quarantine/review surface.

## Local preview

```bash
python3 scripts/preview_local.py
```

Default browser target:

`http://127.0.0.1:<port>/studio`

Storefront remains available at:

`http://127.0.0.1:<port>/`

Use `--route /` if the storefront should open first.

This launcher never deploys.

## Promotion rule

Nothing in `apps/_incoming/studio-cms-editor-harvest` becomes runtime authority merely because it was staged.

Promotion requires a separate implementation decision and should normally result in one or more of:

- `apps/client-cms-editor` improvements
- a future `packages/agentsam-cms` family
- `packages/theme-inneranimals-site`
- `packages/identity/src/providers/openai`
- reusable editor primitives/components

The donor remains useful even after promotion because it provides provenance and a historical live example.
