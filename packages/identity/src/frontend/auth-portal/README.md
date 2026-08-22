# Auth portal — CMS-edit friendly

Pages copied **verbatim** from IAM `static/pages/auth/*` — reorganize only.

## White-label (customer / CMS)

| Hook | Location | Customer change |
|------|----------|-----------------|
| Brand title | `<title>`, hero copy | CMS field or `portal.brand.name` at init |
| Logo | header / OAuth buttons | `portal.brand.logoUrl` |
| Colors | `:root { --auth-bg, ... }` | theme tokens — **no JS changes** |
| OAuth labels | button text | HTML only |

`agentsam init identity` (Phase 5) injects brand tokens into copied HTML — same globe/login UX, new logo/colors in minutes.

## Source map

| File | IAM source |
|------|------------|
| `pages/login.html` | `inneranimalmedia/static/pages/auth/login.html` |
| `pages/signup.html` | `static/pages/auth/signup.html` |
| `pages/reset.html` | `static/pages/auth/reset.html` |

## API routes (unchanged)

- `POST /api/auth/login`
- OAuth: `/api/oauth/google/start`, `/api/oauth/github/start`
- GCP: per-client when demanded — scaffold only until requested

Sensitive finalize stays server-side (`oauth/callback` → Identity Service).

## Local preview (before client integration)

From the SDK repo or after `npm install @inneranimalmedia/agentsam-sdk`:

```bash
npm run preview:auth-portal
# or
npx agentsam identity preview --open
npx agentsam-auth-portal --port 8791
```

Serves production paths (`/auth/login`, `/auth/signup`, `/auth/reset`) with stub APIs:

| Flow | Preview behavior |
|------|------------------|
| Password login | `preview@example.com` / `preview` → success + globe exit |
| Backup code | any input → success stub |
| Password reset | always succeeds (stub JSON) |
| OAuth buttons | stub page + link to globe-exit demo |

Hub: `http://127.0.0.1:8791/` lists all entry points.
