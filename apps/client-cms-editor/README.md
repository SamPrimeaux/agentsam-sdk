# AgentSam Client CMS

Reusable, white-label **website + CMS application kit** published as `@inneranimalmedia/client-cms-editor`.

A developer can scaffold a customer website, run it completely locally, browse the public pages and CMS, customize or import a theme, edit and publish through real local persistence, then connect identity/cloud/deployment providers without replacing the CMS or content model.

**Authority order:** donor behavior → this npm package → adapters under the UX → registry receipts last.  
See [`ALPHA.md`](./ALPHA.md) and [`acceptance/cms-parity.v1.json`](./acceptance/cms-parity.v1.json).

```text
scaffold
  ↓
customer project
  ├── public multi-page site (header / pages / footer)
  └── protected CMS (pages · sections · blocks · media · theme · draft/preview/publish)
        ↓
same CmsEditorAdapter authority
```

## First-run (local before cloud)

```bash
npx agentsam-cms create my-site --starter heuristic   # or blank | import --theme ./old-theme.zip
cd my-site
npx agentsam-cms dev
```

Then browse:

| URL | Surface |
|-----|---------|
| `http://localhost:4317/` | Published public home |
| `http://localhost:4317/about` | Published interior page |
| `http://localhost:4317/cms` | Protected CMS (local-dev principal by default) |

No GitHub / Cloudflare / Supabase account is required to inspect or use the local product.

### Starters

| Starter | Meaning |
|---------|---------|
| **Heuristic** | Built-in multipage starter pack |
| **Blank** | Empty durable site shell |
| **IASF** | Stock Inner Animal Storefront (`--starter iasf`) |
| **Import existing theme** | Directory or `.zip` → safe intake → ThemePack → `installStarterPack` |

Imported themes are normalized into the **same** `CmsStarterPack` contract Heuristic uses. The editor never parses ZIP/Liquid itself — import/refinery tooling does.

## Architecture

```text
CmsEditor / public renderer
        ↓
CmsEditorAdapter

LOCAL     →  ./sqlite-adapter  (Node / node:sqlite)
CLOUD     →  D1 + R2 adapter
OTHER     →  HTTP / custom
```

- Browser CMS UI does **not** import `node:sqlite`.
- `./sqlite-adapter`, `./import`, and `./local` are Node/local-runtime surfaces.
- Root package `engines` stay cross-runtime (`node >= 20`); only `./sqlite-adapter` documents the `node:sqlite` requirement.

## Auth boundary

`/cms` is protected through a portable `CmsAuthHost` contract. Local scaffolds use an explicit local-development principal. Stock sign-in options for OAuth / CMS prebuild:

- **Cloudflare** — `createStockCmsAuthHost('cloudflare')`
- **Google** — `createStockCmsAuthHost('google')`
- **Inner Animal Media** — `createStockCmsAuthHost('inneranimalmedia')`
- **ChatGPT** — `createStockCmsAuthHost('chatgpt')` (Apps SDK hosted headers)

Consumers wire OAuth/OIDC/their identity service without rebuilding route protection.

## Persistence

| Adapter | Role |
|---------|------|
| SQLite | desktop/offline authority via `./sqlite-adapter` |
| D1 + R2 | cloud authority from **proven** OAuth resources |
| HTTP / custom | consumer backend |
| localStorage | UI chrome cache only — never scaffolded as authority |

## Development / gates

```bash
cd apps/client-cms-editor
npm ci
npm run build
npm run verify:cms
# package + memory + sqlite durability + theme import + browser isolation + pack/bin
```

Release (`private:false` required):

```bash
npm run verify:cms-release
npm publish --tag alpha --access public
```
