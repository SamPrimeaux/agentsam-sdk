# AgentSam Ecommerce + CMS

`@inneranimalmedia/ecommerce-cms-agentsam` is the portable commerce + public-site authoring product used by AgentSam Local Studio and standalone customer installs.

It owns the complete application composition surface: CMS hub, public-site/theme editing, media, commerce administration, analytics, and Theme Studio. `@inneranimalmedia/client-cms-editor` is the reusable editor engine; consumers should enter through this package when they want the complete ecommerce/CMS product.

## Public-site authoring

The package is composition-first: groups organize sections, sections contain blocks, and routes/pages are containers and publication targets rather than the primary editing primitive. It supports durable group/section/block authoring, real theme-project editing, composition revisions/restores, draft preview, publication, media selection/upload, design tokens, theme packages, and import/export. Hosted authority uses D1 + the configured `WEBSITE_ASSETS` R2 role. Packaged Local Studio uses the same surface and routes authenticated CMS calls through the native desktop service bridge.

Site/account provisioning remains intentionally separate from content editing: the CMS edits a selected property but does not silently create/delete Cloudflare accounts, domains, or deployment resources.

Exports:

- `@inneranimalmedia/ecommerce-cms-agentsam/cms`
- `@inneranimalmedia/ecommerce-cms-agentsam/cms/capabilities`
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
