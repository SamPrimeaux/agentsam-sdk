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
# + verify:cms-adapter-smoke   (memory)
# + verify:cms-sqlite-smoke    (durable reopen proof — required)
# + verify:cms-browser-smoke   (fresh tarball root must not pull node:sqlite)
# + pack:check
```

Release proof (requires flipping `private: false` first — do not publish until green):

```bash
# edit package.json private → false
npm run verify:cms-release   # includes sqlite + browser smokes before pack/consumer proof
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
