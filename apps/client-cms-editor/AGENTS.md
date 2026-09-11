# Client CMS Editor workspace law

- This app is an independent workspace root. Keep one active lockfile at `apps/client-cms-editor/package-lock.json`.
- Do not add its frontend/backend/shared packages to the SDK root workspace list.
- Product-neutral AgentSam contracts/UI live in `packages/agentsam-contracts` and `packages/agentsam-workbench`.
- Do not import from `apps/local-studio` or `apps/cad-creator`.
- `shared/cms` owns pure CMS editor/publication/config contracts only; no React and no vendor runtime SDKs.
- `backend/` is the portable host API/routing/preview bridge. Do not duplicate the canonical Inner Animal Media CMS server domain here.
- Public CMS runtime must remain smaller than the authoring app. Do not ship Monaco, terminal, browser automation, auth-admin, or the whole AgentSam workbench to anonymous visitors.
- `SESSION_CACHE` is never auth/session authority. `MY_CONTAINER` is never identity authority.
- CMS AgentSam context must be explicit. Never scrape editor/site state silently.
- Prefer structured/versioned section data for publication. Arbitrary executable editor HTML is not a public-content authority.
