# AgentSam Ecommerce + CMS

`@inneranimalmedia/ecommerce-cms-agentsam` is the portable commerce + public-site authoring product used by AgentSam Local Studio and standalone customer installs.

It owns the complete application composition surface: CMS hub, public-site/theme editing, media, commerce administration, analytics, and Theme Studio. `@inneranimalmedia/client-cms-editor` is the reusable editor engine; consumers should enter through this package when they want the complete ecommerce/CMS product.

## Public-site authoring

The package is composition-first: groups organize sections, sections contain blocks, and routes/pages are containers and publication targets rather than the primary editing primitive. It supports durable group/section/block authoring, real theme-project editing, composition revisions/restores, draft preview, publication, media selection/upload, design tokens, theme packages, and import/export. Hosted authority uses D1 + the configured `WEBSITE_ASSETS` R2 role. Packaged Local Studio uses the same surface and routes authenticated CMS calls through the native desktop service bridge.

Site/account provisioning remains intentionally separate from content editing: the CMS edits a selected property but does not silently create/delete Cloudflare accounts, domains, or deployment resources.

Exports:

- `@inneranimalmedia/ecommerce-cms-agentsam/cms`
- `@inneranimalmedia/ecommerce-cms-agentsam/cms/capabilities`
- `@inneranimalmedia/ecommerce-cms-agentsam/store/mount`
- `@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/mount`
- `@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/bridge`
- `@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/project`
- `@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/cms-adapter`

## Portable runtime

```bash
npx agentsam-ecommerce doctor
npx agentsam-ecommerce preview
npx agentsam-ecommerce scaffold ./my-store
```

Scaffolds exclude credentials, private customer state, and provider secrets. Each owner provisions its own deployment resources and provider accounts.

## Canonical merchant Online Store surface

The existing FNF Online Store DOM and responsive CSS is packaged as
`store/mount`, with its runtime and styles emitted to `commerce-store/` by
Local Studio's `themeSurfacesPlugin`. It is **not** a second CMS editor or a
hardcoded FNF site: `mountOnlineStore(iframe, { loadStore, onEdit, baseUrl,
storefrontUrl })` receives authorized site data from its host.

- `/cms` opens the merchant Store for an authenticated, registered property.
  The existing `/store` and `/themes` theme libraries remain available for
  bundled theme draft workflows.
- **Edit theme** opens the existing `theme-editor/mount` runtime with the
  corresponding site's real registered page adapter.
- Signed remote Worker CMS requests remain owned by each customer's Worker;
  no shared-D1 fallback or silent site seeding is permitted.
- An authorized public domain is used for live desktop/mobile store previews.
  Missing or inaccessible storefront data is shown as unavailable, not replaced
  with a fixture or Local Studio's own homepage.
- Analytics, active-theme metadata, imported themes, and theme publishing must
  stay unverified/disabled until the commerce site exposes the required real
  contracts. Page publishing is **not** equivalent to publishing a theme.
- Hosted and Tauri desktop share the same shipped assets. Offline desktop
  without registered remote sites still opens local-project authoring.

Verification:

```bash
npm run build:dev --prefix apps/local-studio
npm run build:desktop --prefix apps/local-studio
npm run smoke:commerce-store --prefix apps/local-studio
npm run smoke:themes --prefix apps/local-studio
node --test test/integration/cms-multisite-security.test.mjs
```
