# Client CMS Editor — alpha lane

## Authority order (non-negotiable)

1. **Donor behavior** (`studio-cms-editor` + harvest plans) is acceptance authority.
2. **`@inneranimalmedia/client-cms-editor` npm artifact** is product authority.
3. Adapters (SQLite / D1+R2 / HTTP) sit **under** the UX.
4. Registry / `agentsam_products` rows are **receipts after** the artifact exists.
5. Local Studio / InnerAnimalMedia are **consumers** of the packed package.

Do not: registry-first, Rust/asrust/machine dilution, localStorage-as-backend, or “npm publish out of scope.”

## Worktree

Active lane worktree: `agentsam-sdk-cms-alpha`  
Branch: `feat/client-cms-editor-alpha-20260929`

Read-only donors (outside the package; do not modify):

- `studio-cms-editor` checkout on this machine
- `studio-cms-editor-harvest-export`
- AgentSam harvest folder `studio-cms-editor-20260929`
- in-tree copy: `apps/client-cms-editor/reference/harvest/`

## Release staircase

```text
DONOR PARITY INVENTORY          ← acceptance/cms-parity.v1.json
        ↓
PACKAGE BOUNDARY                ← exports/files, no file: deps, no private
        ↓
0.1.0-alpha.0 PUBLIC NPM
        ↓
clean-install proof
        ↓
Pages → Sections → Blocks/Inspector → Media parity
        ↓
Draft / Preview / Publish (M1 loop)
        ↓
Cloud adapter + SQLite adapter proofs
        ↓
Local Studio + InnerAnimalMedia consume packed artifact
        ↓
0.1.0 latest
```

## Gates (run from `apps/client-cms-editor`)

```bash
npm ci
npm run build
npm run verify:cms-package   # green while private:true once boundary is correct
npm run pack:check
```

Release proof (requires flipping `private: false` first — do not publish until green):

```bash
# edit package.json private → false
npm run verify:cms-release
npm publish --tag alpha --access public
```

`verify:cms-package` must **not** fail merely because `private:true`.
`verify:cms-release` **must** fail while `private:true`.

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
