# Fuel & Free Time — Admin UI (`apps/ecommerce-cms-agentsam/frontend/`)

First-class React + TypeScript admin application. Built with Vite, served at clean URLs **`/admin/analytics/*`** (no `.html`).

## Public URLs

| URL |
|-----|
| `/admin/analytics/overview` |
| `/admin/analytics/finance` |
| `/admin/analytics/health` |

Vite bundles live at `/admin/_spa/assets/` (internal only). Legacy `/admin-app/*` and `*.html` analytics paths 301 to the URLs above.

## Dev

```bash
# Terminal 1 — Worker API + legacy static admin
cd ~/fuelnfreetime && npm run dev

# Terminal 2 — Admin SPA with HMR
npm run dev:admin
# → http://localhost:5173/admin-app/analytics/overview
```

## Build & deploy

```bash
npm run build:admin   # outputs to dist/assets/admin/_spa/
npm run deploy        # build:admin + wrangler deploy
```

---

## Source map

```
apps/ecommerce-cms-agentsam/frontend/
├── index.html                 # SPA shell; links /admin/css/console.css + admin.css
├── vite.config.ts             # base /admin-app/, outDir ./dist
├── package.json
├── tsconfig*.json
└── src/
    ├── main.tsx               # React root, BrowserRouter basename=/admin-app
    ├── App.tsx                # Routes: /analytics/{overview,finance,health}
    ├── index.css              # #root min-height
    ├── lib/
    │   ├── api.ts             # adminFetch, requireSession → /api/admin/me
    │   ├── format.ts          # fmtNum, genSeries, seedRand (mock data helpers)
    │   └── types.ts           # RangeKey, ChartSeries, DonutSlice
    ├── layout/
    │   └── AdminLayout.tsx    # Sidebar + topbar (legacy pages = <a href>, analytics = React Router)
    ├── components/
    │   └── analytics-ui.tsx   # Icon, KPI, AreaChart, Donut, Sparkline, RangePicker, …
    ├── pages/analytics/
    │   ├── AnalyticsShell.tsx # Range picker + <Outlet /> (shared range state)
    │   ├── OverviewPage.tsx   # Store overview dashboard
    │   ├── FinancePage.tsx    # Finance dashboard
    │   └── HealthPage.tsx     # Infrastructure / health dashboard
    └── styles/
        ├── analytics.css      # Dashboard theme (cards, charts, KPIs)
        └── analytics-shell.css # Light outer shell + glassmorphic cards
```

### Build output (committed on deploy)

```
dist/assets/admin/_spa/
├── index.html
└── assets/
    ├── index-*.css            # Bundled analytics + shell styles
    ├── index-*.js             # React app bundle (~518KB)
    └── index-*.js.map         # Source maps
```

### Worker integration (`apps/ecommerce-cms-agentsam/backend/index.js`)

| Path | Behavior |
|------|----------|
| `/admin-app/*` | Session required; static assets served; unknown paths → `index.html` (SPA) |
| `/admin/analytics/*.html` | 301 → `/admin-app/analytics/*` |
| `/admin/dashboard/{overview,finance,analytics}.html` | 301 → SPA routes |

### Routes (in-app)

| URL | Page |
|-----|------|
| `/admin-app/` | → `/admin-app/analytics/overview` |
| `/admin-app/analytics/overview` | OverviewPage |
| `/admin-app/analytics/finance` | FinancePage |
| `/admin-app/analytics/health` | HealthPage |

---

## Legacy files — safe to delete after verification

These were replaced by the SPA. **Keep redirects in `apps/ecommerce-cms-agentsam/backend/index.js` until you remove the files**, or delete files and rely on redirects only (redirects already point to SPA).

### Delete now (analytics iframe stack)

| File | Reason |
|------|--------|
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/embed.html` | Iframe host + in-browser Babel |
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/overview.html` | Shell + analytics-boot iframe |
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/finance.html` | Same |
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/health.html` | Same |
| `apps/ecommerce-cms-agentsam/frontend/static/js/analytics-boot.js` | Iframe loader + postMessage nav |
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/assets/111a6d5a-*.js` | Legacy App.jsx (babel) |
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/assets/98b26e01-*.js` | OverviewPage (ported to TSX) |
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/assets/ab9573c2-*.js` | FinancePage |
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/assets/cc20c761-*.js` | HealthPage |
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/assets/b3ebf5b6-*.js` | Shared components (ported) |
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/assets/d4bbf6c3-*.js` | React runtime bundle |
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/assets/0776a419-*.js` | ReactDOM bundle |
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/assets/e6f8636f-*.js` | Babel standalone |
| `apps/ecommerce-cms-agentsam/frontend/static/dashboard/overview.html` | Redirect-only stub |
| `apps/ecommerce-cms-agentsam/frontend/static/dashboard/finance.html` | Redirect-only stub |
| `apps/ecommerce-cms-agentsam/frontend/static/dashboard/analytics.html` | Redirect-only stub |

### Keep for now

| File | Reason |
|------|--------|
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/assets/*.woff2` | Font files referenced by `analytics.css` |
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/analytics.css` | Optional duplicate; SPA bundles copy in `src/styles/` |
| `apps/ecommerce-cms-agentsam/frontend/static/analytics/analytics-shell.css` | Optional duplicate; bundled in SPA |
| `apps/ecommerce-cms-agentsam/frontend/static/css/console.css` | Shared shell styles for SPA + legacy pages |
| `apps/ecommerce-cms-agentsam/frontend/static/css/admin.css` | Shared shell styles |
| `dist/assets/admin/js/shell.js` | Legacy HTML admin pages still use this |

### Root tooling (optional delete)

| File | Reason |
|------|--------|
| `analytics-3pt-dashboard-buildin.html` | Original export blob; archive or delete |
| `scripts/unpack-analytics.mjs` | One-time unpack; superseded by `scripts/port-analytics-pages.mjs` |
| `scripts/port-analytics-pages.mjs` | Re-port script if legacy JS ever updated |

---

## Not yet migrated (still legacy `.html`)

These remain separate HTML + `shell.js` until a future sprint:

- `home.html`, `orders.html`, `products.html`, `product-edit.html`, `inventory.html`
- `subscribers.html`, `content.html`, `pages.html`, `page-edit.html`
- `store.html`, `theme-editor.html`, `preferences.html`, `account.html`, `login.html`
- `dashboard/email.html`, `scaffold.html`, `media.html`

**Phase 2:** Move shell into `AdminLayout.tsx` fully and migrate Content/Pages/Products into `apps/ecommerce-cms-agentsam/frontend/src/pages/`.

---

## Data note

Dashboards still use **seeded mock series** (`genSeries`). Next step: replace with `/api/admin/*` + Cloudflare Analytics bindings.
