# Local Studio backend

This package owns the server/runtime side of the `agentsam-sdk` Local Studio application.

```text
backend/
├─ package.json
├─ wrangler.jsonc       Cloudflare deployment SSOT
├─ migrations/
└─ server/              Nitro server routes, middleware, runtime adapters
```

There is intentionally no handwritten `backend/worker/` entry point. TanStack Start + Nitro emits the production Worker into the Local Studio workspace root:

```text
../.output/server/index.mjs
../.output/public/
```

From `apps/local-studio/`:

```sh
npm ci
npm run build
npm run cf:verify-output
npm run cf:dry-run
npm run cf:deploy
```

Production Worker: `agentsam-sdk` at `https://agentsam.inneranimalmedia.com`. The workers.dev route is disabled.
