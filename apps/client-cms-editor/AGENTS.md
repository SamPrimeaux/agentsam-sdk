# Client CMS Editor workspace law

- Product authority is the installable npm package `@inneranimalmedia/client-cms-editor`, not D1 registry rows and not Local Studio vite aliases.
- Donor behavioral authority: `studio-cms-editor` + `reference/harvest/plans/CMS-EDITOR-HARVEST.md`. Encode requirements in `acceptance/cms-parity.v1.json`.
- This app is an independent workspace root. Keep one active lockfile at `apps/client-cms-editor/package-lock.json`.
- Do not add its frontend/backend/shared packages to the SDK root workspace list.
- Do not import from `apps/local-studio` or `apps/cad-creator`.
- `shared/cms` owns pure CMS editor/publication/adapter/config contracts only; no React and no vendor runtime SDKs.
- Persistence adapters implement `CmsEditorAdapter` (`shared/cms/src/adapter.ts`). Never treat localStorage as an authority or scaffold persistence choice.
- `backend/` is a portable host bridge. InnerAnimalMedia `/api/cms/*` is one consumer implementation of the adapter contract — not the product architecture.
- Do not invent product resources (Worker binding labels, fixed account/database IDs, or deployment hostnames) inside this package.
- Public CMS runtime must remain smaller than the authoring app. Do not ship Monaco, terminal, browser automation, auth-admin, or the whole AgentSam workbench to anonymous visitors.
- `SESSION_CACHE` is never auth/session authority. `MY_CONTAINER` is never identity authority.
- CMS AgentSam context must be explicit. Never scrape editor/site state silently.
- Prefer structured/versioned section data for publication. Arbitrary executable editor HTML is not a public-content authority.
- Before calling a release good: `npm run verify:cms` must pass, then a fresh empty-folder install of the packed/published tarball must boot the editor.
