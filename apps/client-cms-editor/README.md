# AgentSam Client CMS Editor

Authoring/control application for AgentSam CMS. This directory is a self-contained npm workspace root inside the SDK repository and is intentionally **not** part of the SDK root workspace graph.

It was imported from `SamPrimeaux/inneranimalmedia` at the exact revision recorded in `IMPORT_PROVENANCE.json`. The donor browser editor is preserved, then normalized into explicit frontend/backend/shared package boundaries.

```text
apps/client-cms-editor/
├─ package.json
├─ package-lock.json
├─ frontend/                 CMS authoring UI + shared AgentSam workbench adapter
│  ├─ package.json
│  └─ src/
├─ backend/                  host-neutral CMS API/routing/preview client bridge
│  ├─ package.json
│  └─ src/
├─ shared/
│  └─ cms/                   pure CMS editor/publication/binding/context contracts
│     ├─ package.json
│     └─ src/
└─ reference/                immutable donor docs/lock/config for comparison only
```

## Product boundary

CMS Studio is the authenticated authoring/control product. It is **not** the public website runtime.

```text
CMS Studio
  ├─ pages / sections / themes / assets
  ├─ AgentSam through @inneranimalmedia/agentsam-workbench
  ├─ preview
  └─ publish
       ↓
publication snapshot
  ├─ D1 metadata
  └─ WEBSITE_ASSETS (R2 content/media/theme artifacts)
       ↓
small public CMS runtime
       ↓
<public-host>/*
```

The visitor-facing runtime should ship its normal frontend JavaScript through the normal static deployment bundle. R2 is for CMS-managed content/media and generated artifacts, not a replacement for the application bundle.

## Shared AgentSam rule

CMS must not invent its own chat/browser/terminal/auth stack. `frontend/src/CmsAgentSurface.tsx` is a thin CMS adapter around `@inneranimalmedia/agentsam-workbench`; the host supplies an `AgentWorkbenchAdapter`, authenticated `AgentPrincipal`, and explicit CMS context. No fake AgentSam endpoint is provided by this app.

Identity remains outside the workbench. IAM establishes `accountId` / `authUserId`, application authorization resolves CMS access, and only then may optional browser/container execution be created.

## Cloud binding contract

`shared/cms/src/cloudflare-bindings.ts` defines the capability-driven names. `DB` and `WEBSITE_ASSETS` are the CMS cloud baseline. `SESSION_CACHE` is cache-only and cannot be identity/session authority. `MY_CONTAINER` and `MYBROWSER` are optional execution capabilities and cannot establish identity.

## Canonical CMS backend

This app's `backend/` is currently the portable API/routing/preview bridge that talks to `/api/cms/*`. The full canonical CMS domain still lives in the Inner Animal Media platform under `src/core/agentsam/cms/` at the donor revision. Do not copy that 166-file domain into this app and create a second authority. Its next extraction target is a product-neutral `packages/agentsam-cms/` family.

## Development

From this directory:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

Standalone dev requires explicit site context, for example `/?site=my-site`. In a real authenticated host, mount `CmsEditor` with the resolved site/project identity.
