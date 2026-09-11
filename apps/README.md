# AgentSam apps

`apps/` is the development/authoring source of truth for runnable AgentSam product surfaces. Product apps are independently extractable and are intentionally **not** members of the SDK root npm workspace graph.

## Product app law

Every deployable product app follows the same ownership boundary:

```text
apps/<app>/
├─ package.json
├─ package-lock.json          one lockfile for the whole app
├─ frontend/
│  └─ package.json
├─ backend/
│  ├─ package.json
│  ├─ wrangler.jsonc         Cloudflare binding/deploy SSOT
│  ├─ worker/
│  │  └─ index.js            canonical Cloudflare Worker entry
│  └─ server/ or src/        application/backend modules
└─ shared/<domain>/
   └─ package.json
```

Rules:

- `apps/<app>/` is a self-contained npm workspace root with workspaces `frontend`, `backend`, and `shared/*`.
- Frontend/backend do not get independent lockfiles.
- `backend/worker/index.js` is the checked-in Cloudflare runtime boundary. Generated framework output may be imported by it, but generated output is not the deployment owner.
- `backend/wrangler.jsonc` is the app's Cloudflare configuration SSOT. Do not add app Workers or Wrangler configs at the SDK repository root.
- `shared/<domain>/` is app-local shared code. Promote code to `packages/*` only when it is genuinely SDK-wide/reusable.
- The SDK root owns package/tooling release concerns; app workspace dependencies stay inside each app.

Current product apps governed by the architecture test are `local-studio/`, `cad-creator/`, and `client-cms-editor/`. `frontend/` remains a public-site seed lane rather than a self-contained product workspace, and `_incoming/` is an import drop zone.
