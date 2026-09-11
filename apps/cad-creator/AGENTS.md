# CAD Creator workspace rules

`apps/cad-creator/` is an independent application workspace embedded in the SDK repository for development and export. It is not part of the SDK root npm workspace graph.

## Package boundary

- `frontend/` owns the CAD/agent browser UI.
- `backend/` owns the app API, WebSocket bridge, and app-specific server integration.
- `shared/cad/` owns pure TypeScript CAD project, operation, and validation contracts shared inside this app.
- `reference/` is donor/history material only and must never become runtime authority.
- Keep exactly one active lockfile: `apps/cad-creator/package-lock.json`. Do not add nested lockfiles.

## Cross-product architecture

CAD Creator must not import from `apps/local-studio/`. Product-neutral AgentSam UI/runtime contracts belong in top-level `packages/` packages. The intended extraction order is:

1. `packages/agentsam-contracts/` for framework-neutral AgentSam messages/events/runs/tools/artifacts/context.
2. `packages/agentsam-workbench/` for reusable React agent/workbench UI.
3. Later, `packages/agentsam-cad-contracts/` for CAD runtime/service contracts shared beyond this app.

Keep Agent/UI contract extraction separate from CAD/runtime reconciliation. Do not solve both in one refactor.

## Validation

Run from `apps/cad-creator/`:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

The development and production server must both serve the frontend and `/api/cad/capabilities` successfully.
