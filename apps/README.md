# AgentSam apps

`apps/` is the primary development/authoring source for AgentSam product surfaces. Canonical application identity is declared by `agentsam.app.json` and discovered across both `apps/` and `packages/`; not every directory, npm package, module, or app manifest is independently installable or release-ready. The SDK root owns package/tooling release concerns; product app workspaces remain independently managed where their package contract requires it.

**Current source inventory:** [AGENTSAM_APPLICATION_INVENTORY.md](../docs/architecture/AGENTSAM_APPLICATION_INVENTORY.md). Run `npm run app:inventory` in this checkout for a live source-derived report; the global `agentsam app inventory` command becomes available after the next CLI release.

**Lifecycle SSOT (validate → machine → prove → graduate → install):** [`docs/PRODUCT_LIFECYCLE.md`](../docs/PRODUCT_LIFECYCLE.md).  
Use that doc for product map, graduation gates, scaffold vocabulary, old-school SAM + LLM layering, and how Identity/Desktop/Database lanes must stay extractable for resale.

**Global agent/runtime law:** [`AGENTSAM.md`](../AGENTSAM.md). Product apps may specialize behavior through app-owned manifests/data, but they must not weaken the portability, principal-isolation, deterministic-evidence, or receipt-backed completion rules.

## Product app law

The following is the target ownership boundary for an independently deployable product app; it is not a claim that every current app already meets every gate:

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

The current source inventory contains seven `agentsam.app.json` identities. The self-contained workspace contract in `test/apps-scaffold-contract.test.mjs` currently covers only `local-studio/` and `cad-creator/`; that test scope is not the complete app catalog. The separate `npm run app:boundaries` scan covers top-level app source directories, not only manifest identities. GoalGuru is package-owned at `packages/agentsam-goalguru/`. Embedded modules and providers use `agentsam.package.json` and are not independent apps. `frontend/` remains a public-site seed lane rather than a self-contained product workspace, and `_incoming/` is an import drop zone.

`agentsam app list` lists app-manifest identities only. It does not assert that those identities are independently installable, published, deployed, or healthy. Use `agentsam app inventory` to inspect app identities, modules, provider integrations, supporting packages, and implementation package families together.

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
