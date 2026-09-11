# AgentSam CAD Creator — Agent Handoff

This directory is the development SSOT for the visual CAD Studio starter inside `agentsam-sdk`.

## Import provenance

- Source repository: `SamPrimeaux/AgentSamCadCreation`
- Imported into: `apps/cad-creator/`
- The source commit used for the import is recorded in `.agentsam-source-revision`.
- This is a real file import, not a git submodule.
- Preserve the existing visual Studio experience during architecture work: 2D plan, Split, 3D/BIM viewport, AgentSam copilot rail, templates/fixtures/render controls.

## Product goal

Turn this demo into a reusable AgentSam CAD lane that can serve four roles without forking its contracts:

1. a polished local CAD Studio users can run and preview;
2. a scaffold source for `agentsam create ... --preset cad`;
3. a client of AgentSam's native typed Blender capabilities;
4. a client of the isolated/container CAD runtime used by `agentsam dockerize cad`.

The browser Studio is the interactive design surface. Blender/container runtimes are heavy geometry, render, inspect, and export engines behind the backend contract. Do not replace the browser viewport with Blender.

## Runtime architecture

```text
CAD Studio frontend
        |
        v
backend CAD API
        |
        v
CadRuntime contract
      /     \
 native     container
 Blender    CAD service
```

Frontend code must not spawn processes, own arbitrary filesystem access, or contain Docker/Blender authority.

## Workspace policy

Target this app as a **self-contained npm workspace root**, independent of the SDK root dependency graph:

```text
apps/cad-creator/
  package.json          # private workspace root
  package-lock.json     # CAD app lockfile
  frontend/
    package.json        # React/Vite/browser-only dependencies
  backend/
    package.json        # server/runtime dependencies; no React
  shared/
    cad/
      package.json      # portable contracts/schemas/types
```

Recommended CAD-local workspaces:

```json
{
  "private": true,
  "workspaces": [
    "frontend",
    "backend",
    "shared/cad"
  ]
}
```

Do **not** add these CAD packages to the root `agentsam-sdk/package.json` workspaces. The SDK root already has its own package graph. Keeping CAD self-contained makes it easy to extract, resell, or scaffold as a standalone project later.

Cloudflare/host deployment should build the intended package explicitly (for example `npm run build -w frontend`) rather than changing the SDK repository root to `frontend/`.

## Current import status

The first import intentionally preserves the source repo layout. Do not mix the import with a large UI rewrite.

Existing important boundaries include:

- `backend/routes/`
- `backend/runtime/`
- `backend/services/cad/`
- `backend/security/`
- `backend/database/providers/`
- `shared/cad/`
- `agentsam.template.json`
- `backend/Dockerfile`
- `docker/cad/Dockerfile`

The source root package is still monolithic at import time. Splitting it into the CAD-local workspace shape is Phase 2.

## Canonical CAD direction

The SDK already owns typed Blender capability work. Avoid creating a second incompatible Blender protocol here.

Converge the app on these capability names/contracts:

- `blender.status`
- `blender.inspect`
- `blender.build`
- `blender.render_preview`
- `blender.export`

Higher-level Studio routes may compile project/design state into those deterministic runtime primitives.

The backend should expose one runtime interface that can be implemented by native Blender or the CAD container. Frontend callers should not care which lane is active.

## Security requirements

Keep these invariant while developing:

- no arbitrary Python execution endpoint;
- no arbitrary shell endpoint;
- process spawn via argv arrays with `shell: false`;
- CAD paths bounded to owned project/artifact roots;
- source `.blend` inputs are immutable;
- generated artifacts receive SHA-256 receipts;
- localhost-only by default for local Studio/runtime;
- containers non-root where practical;
- no credentials baked into templates or images;
- no hidden workspace/tenant authority in the CAD runtime.

## Template/gallery pipeline target

Development source and published scaffold payload are different layers:

```text
apps/cad-creator/             development SSOT
        |
        +--> dist/gallery/cad-studio/       runnable/read-only preview
        |
        +--> templates/generated/cad-studio/ scaffold payload
        |
        +--> protocol/presets/catalog.json   catalog metadata
```

Do not publish the entire development source tree in the npm tarball by default. Export only the runtime preview and scaffold payload once the exporter exists.

Expected future package verification:

- every CAD catalog preset has a scaffold payload;
- every visual CAD starter has preview assets;
- no `node_modules/`, `.git/`, `.env`, generated renders, temporary Blender files, or user-specific paths enter scaffold payloads;
- the CAD Studio can run without Blender in browser/mock mode;
- native Blender and container lanes share normalized contracts.

## Phase order

1. **Imported baseline** — preserve current demo and provenance. DONE on this branch.
2. **Workspace split** — create CAD-local `frontend`, `backend`, and `shared/cad` packages with one CAD lockfile.
3. **Contract reconciliation** — compare imported backend Blender/runtime contracts against SDK `src/lib/cad/` and `services/cad/`; eliminate duplicate protocols.
4. **Local Studio integration** — make this app a first-class visual starter/preview in `agentsam start-local`.
5. **Template exporter** — generate `templates/generated/cad-studio/` from this development source.
6. **Catalog/scaffold wiring** — add the CAD preset to AgentSam's preset catalog and deterministic create flow.
7. **Container/native proof** — verify the same project can build/render/export through native Blender and the isolated CAD container.

## Avoid

- Do not rewrite the UI merely to match SDK internals.
- Do not make Docker mandatory for local UI development.
- Do not let React component state become the only project schema.
- Do not duplicate SDK Blender execution behavior without first reconciling with the canonical typed capability.
- Do not couple this app to the SDK root lockfile/workspace graph.
