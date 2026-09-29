# AgentSam Client CMS Editor

Portable CMS authoring product published as `@inneranimalmedia/client-cms-editor`.

**Authority order:** donor behavior → this npm package → adapters under the UX → registry receipts last.  
See [`ALPHA.md`](./ALPHA.md) and [`acceptance/cms-parity.v1.json`](./acceptance/cms-parity.v1.json).

This directory is a self-contained npm workspace root inside the SDK repository and is intentionally **not** part of the SDK root workspace graph. Local Studio must eventually consume the **packed/published** artifact — not vite-alias into `shared/cms/src`.

```text
apps/client-cms-editor/
├─ package.json              product package (alpha → latest)
├─ acceptance/               donor parity / M1 acceptance matrix
├─ frontend/                 CMS authoring UI
├─ backend/                  portable adapter/bridge (not IAM-specific architecture)
├─ shared/cms/               types + CmsEditorAdapter contract
├─ reference/harvest/        copied harvest evidence (read-only)
└─ scripts/                  verify:cms-package · pack:check
```

## Product boundary

CMS Studio is the authenticated authoring/control product. It is **not** the public website runtime.

```text
CMS Studio (this package)
  ├─ pages / sections / blocks / themes / assets
  ├─ optional AgentSam via host-supplied workbench adapter
  ├─ preview draft
  └─ explicit publish
       ↓
CmsEditorAdapter (sqlite | d1+r2 | http | custom)
       ↓
publication snapshot / public runtime
```

## Persistence

| Adapter | Role |
|---------|------|
| SQLite | desktop/offline authority |
| D1 + R2 | cloud authority from **proven** OAuth resources |
| HTTP / custom | consumer backend |
| localStorage | UI chrome cache only — never scaffolded as authority |

## Shared AgentSam rule

CMS must not invent its own chat/browser/terminal/auth stack. When AgentSam is present, the host supplies workbench adapter + principal + explicit CMS context. Core editor UX must still run without AgentSam.

## Development

```bash
cd apps/client-cms-editor
npm ci
npm run verify:cms-package   # currently fails until package is publishable
npm run typecheck
npm test
npm run build
npm run dev
```

Standalone mount requires explicit site context. Prefer injecting a `CmsEditorAdapter` rather than relying on hardcoded `/api/cms/*` host routes.
