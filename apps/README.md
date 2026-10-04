# AgentSam apps

`apps/` is the development/authoring source of truth for runnable AgentSam product surfaces. Product apps are independently extractable and are intentionally **not** members of the SDK root npm workspace graph.

**Lifecycle SSOT (validate → machine → prove → graduate → install):** [`docs/PRODUCT_LIFECYCLE.md`](../docs/PRODUCT_LIFECYCLE.md).  
Use that doc for product map, graduation gates, scaffold vocabulary, old-school SAM + LLM layering, and how Identity/Desktop/Database lanes must stay extractable for resale.

**Global agent/runtime law:** [`AGENTSAM.md`](../AGENTSAM.md). Product apps may specialize behavior through app-owned manifests/data, but they must not weaken the portability, principal-isolation, deterministic-evidence, or receipt-backed completion rules.

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

## Portable packaging checklist

Run from the repository root before publishing an APP:

```sh
npm run app:validate
npm run app:packaging
agentsam app package <app-id> --dry-run
```

`app:packaging` audits every APP manifest in `apps/` and package-owned APP under `packages/`. It verifies the package name/manifest relationship, explicit npm `files` allowlists, app-owned lockfiles, CLI bins, frontend/backend package boundaries where declared, and excludes donor/reference/attachment payloads from packed artifacts. It does not download dependencies, build a frontend, deploy a Worker, or claim a release is ready.

For an app workspace, the release sequence is:

```sh
cd apps/<app-id>
npm ci
npm run build
npm run typecheck --workspaces --if-present
npm test
npm pack --dry-run --json
```

Frontend packages must publish compiled browser-safe assets only when they are intentionally public. Backend packages must keep secrets, `.dev.vars`, local databases, and host credentials out of `files`. Cloudflare Worker configuration remains backend-owned and is deployed separately from the npm tarball unless the app's package contract explicitly includes it.

<!-- agentsam:trademark-notice -->
> Independent project. Not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. or by any other company whose products are named here. Cloudflare is a registered trademark of Cloudflare, Inc. Other names are trademarks of their respective owners. See [TRADEMARKS](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/TRADEMARKS.md).
