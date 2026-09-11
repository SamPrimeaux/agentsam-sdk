# CAD development lane

## Current location

`apps/cad-creator/` is the imported development source for the AgentSam CAD Studio.

Import source: `SamPrimeaux/AgentSamCadCreation`.

The exact donor revision is stored in `apps/cad-creator/.agentsam-source-revision`. See `apps/cad-creator/AGENTS.md` for the agent handoff and phase plan.

## Boundary decision

The CAD app should become a **self-contained npm workspace root** rather than joining the SDK root workspace graph.

Why:

- frontend, backend, and shared CAD contracts need independent dependency graphs;
- one CAD-local lockfile keeps those packages in sync;
- `shared/cad` can be imported by both browser and backend without duplicate types;
- the entire app can later be extracted, sold, or scaffolded as a standalone project;
- the SDK's own root lockfile/workspaces remain focused on SDK runtime packages.

Target:

```text
apps/cad-creator/
  package.json
  package-lock.json
  frontend/package.json
  backend/package.json
  shared/cad/package.json
```

The imported donor is still a monolithic root package and currently carries `bun.lock`. Do not treat that as the final packaging policy. Phase 2 should convert the app to npm workspaces and generate the CAD-local `package-lock.json` while preserving behavior.

## Runtime contract

```text
frontend Studio
    -> backend CAD API
        -> CadRuntime
            -> native Blender
            -> CAD container
```

The frontend is presentation/editing only. Backend/runtime code owns filesystem/process/container authority.

The app must converge on the SDK CAD capabilities rather than inventing parallel semantics:

- `blender.status`
- `blender.inspect`
- `blender.build`
- `blender.render_preview`
- `blender.export`

## Distribution direction

`apps/cad-creator/` is development source, not automatically npm package payload.

Future build/export flow:

```text
apps/cad-creator/
  -> dist/gallery/cad-studio/          preview used by AgentSam Local
  -> templates/generated/cad-studio/   deterministic scaffold payload
  -> protocol/presets/catalog.json      catalog entry
```

`agentsam start-local` should eventually present the CAD Studio in the visual template/gallery surface. The terminal remains a slide-up drawer/panel in that local Studio experience, not the primary full-screen UI.

## Immediate next development work

1. Verify the imported app runs unchanged from `apps/cad-creator/`.
2. Split into CAD-local npm workspaces (`frontend`, `backend`, `shared/cad`) without redesigning the UI.
3. Reconcile imported Blender/runtime code against SDK `src/lib/cad/` and `services/cad/`.
4. Make the shared CAD project schema authoritative instead of React component state.
5. Add deterministic preview + scaffold exporters.
6. Wire a `cad` preset into the AgentSam catalog/create flow.
7. Prove native Blender and container execution through the same normalized backend contract.
