# Client CMS Editor — alpha lane

## Authority order (non-negotiable)

1. **Donor behavior** (`studio-cms-editor` + harvest plans) is acceptance authority.
2. **`@inneranimalmedia/client-cms-editor` npm artifact** is product authority.
3. Adapters (SQLite / D1+R2 / HTTP) sit **under** the UX.
4. Registry / product catalog rows are **receipts after** the artifact exists.
5. Embedding applications are **consumers** of the packed package.

Do not: registry-first, Rust/asrust/machine dilution, localStorage-as-backend, or “npm publish out of scope.”

## Worktree

Active lane worktree: `agentsam-sdk-cms-alpha`  
Branch: `feat/client-cms-editor-alpha-20260929`

Read-only donors (outside the package; do not modify):

- `studio-cms-editor` checkout on this machine
- `studio-cms-editor-harvest-export`
- harvest folder `studio-cms-editor-20260929`
- in-tree copy: `apps/client-cms-editor/reference/harvest/`

## Release staircase

```text
DONOR PARITY INVENTORY          ← acceptance/cms-parity.v1.json
        ↓
PACKAGE BOUNDARY                ← exports/files, no file: deps, private ok
        ↓
ANTI-FAKE RUNTIME               ← no automatic demo write short-circuit
        ↓
0.1.0-alpha.0 PUBLIC NPM        ← private:false → verify:cms-release → publish
        ↓
clean-install proof
        ↓
Pages → Sections → Blocks/Inspector → Media parity
        ↓
Draft / Preview / Publish (M1 loop)
        ↓
Cloud adapter + SQLite adapter proofs
        ↓
Embedding hosts consume packed artifact
        ↓
0.1.0 latest
```

## Gates (run from `apps/client-cms-editor`)

```bash
npm ci
npm run build
npm run verify:cms
# = verify:cms-package
# + verify:cms-adapter-smoke
# + verify:cms-sqlite-smoke
# + verify:cms-theme-import   (real donor theme → SQLite → multipage localhost)
# + verify:cms-browser-smoke
# + pack:check               (incl. agentsam-cms bin survives pack)
```

## Product contract (alpha)

Reusable dual-sided website + CMS — not “editor only”:

1. Heuristic + Blank + Import Theme are first-run paths
2. Public multipage routes + `/cms` share the same local CmsEditorAdapter authority
3. Import = intake → ThemePack/CmsStarterPack → `installStarterPack` (no provider-specific install APIs)
4. Auth boundary (`CmsAuthHost`) is provider-neutral; local-dev principal is explicit
5. `agentsam-cms` bin must survive npm pack / fresh install (`npx agentsam-cms --help`)
6. Public renderer ownership: `local/public-renderer.ts` + `local/dev-server.ts` (export `./local`)

Release proof (requires `private: false`):

```bash
npm run verify:cms-release
npm publish --tag alpha --access public
```

`verify:cms-package` must **not** fail merely because `private:true`.
`verify:cms-release` **must** fail while `private:true`.
Do **not** raise package-wide `engines` for `node:sqlite` — that requirement is documented on `./sqlite-adapter` only.

Do **not** flip `private:false` while dist still contains automatic fake-success machinery.

## Stock starter

Heuristic (`starter-packs/heuristic`) is the shipped recommended starter pack.
Install via `installStarterPack(adapter, heuristicStarterPack)` into a real adapter.
Temporary in-memory preview is an adapter choice — the pack itself is not ephemeral.

## M1 loop (must pass before “CMS works”)

open site → page tree → open page → canvas draft → select section →
highlight ↔ inspector → edit field → dirty → Save Draft → reload persists →
preview draft (published unchanged) → Publish → published revision updates

## Persistence

| Kind | Role |
|------|------|
| SQLite | local/desktop authority |
| D1 + R2 | cloud authority via proven OAuth resources |
| HTTP / custom | consumer-supplied adapter |
| localStorage | UI chrome cache only — never an adapter / scaffold choice |
