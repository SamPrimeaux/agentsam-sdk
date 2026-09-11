# AgentSam Local Studio

Authoring workspace for the browser UI launched by `agentsam start-local`.

This app was seeded from the working `AgentSam-Grok-Workmode` Studio UI and is being normalized here before it is exported to `dist/local-studio/`. Routes and cloud deployment wiring are donor-era details and are expected to change; the reusable shell, workbench, terminal, browser, Monaco, helper-chat and project UX are the parts to preserve.

## Workspace boundary

```text
apps/local-studio/
├─ package.json              one private npm workspace root
├─ package-lock.json         one lockfile for the whole app
├─ frontend/                 React / TanStack Studio UI
│  ├─ package.json
│  ├─ public/
│  └─ src/
├─ backend/                  server middleware, migrations and optional cloud adapters
│  ├─ package.json
│  ├─ migrations/
│  ├─ server/
│  └─ worker/
├─ shared/
│  └─ agentsam/              UI/backend-neutral AgentSam contracts
│     ├─ package.json
│     └─ src/
├─ scripts/                  app-local build/test/dev helpers
└─ reference/                preserved donor material; never runtime authority
```

`apps/local-studio` is intentionally **not** a workspace of the SDK repository root. It owns its own dependency graph and lockfile. The root SDK publishes the built/exported runtime later, not this authoring tree.

## Commands

From `apps/local-studio/`:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

The current build writes `.output/` as an intermediate donor-compatible build. The SDK packaging pass will convert the distributable browser/runtime assets into `dist/local-studio/`.

## Ownership rules

- `frontend/` is the only active UI source authority. The donor's old duplicate root `src/` is preserved under `reference/donor-root-src/` only.
- `backend/` owns server middleware, migrations, Worker adapters and deployment-specific code.
- `shared/agentsam/` owns Local Studio-only project/trail/shell state. Product-neutral agent contracts live in `packages/agentsam-contracts/`, and reusable UI lives in `packages/agentsam-workbench/`.
- Keep exactly one `package-lock.json`, at this directory root. Do not create nested lockfiles.
- Do not add these app workspaces to the SDK root `workspaces` list. Shared `packages/agentsam-*` packages are separate SDK-root workspaces and are consumed through package imports.
- Do not make `apps/local-studio` depend on the published `@inneranimalmedia/agentsam-sdk`; the SDK is the parent product and will package the built Studio artifact.
- Existing route names are temporary donor behavior. Preserve capabilities and UX while route/product boundaries are redesigned.

## Donor provenance

See `IMPORT_PROVENANCE.json` for the immutable source revision and `reference/DONOR_README.md` / `reference/DONOR_APP_LAYOUT.md` for the original Workmode documentation.
