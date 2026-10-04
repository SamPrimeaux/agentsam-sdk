# Local Studio backend

This package owns the server/runtime side of the `agentsam-sdk` Local Studio application.

```text
backend/
├─ package.json
├─ wrangler.jsonc       Cloudflare deployment SSOT
├─ worker/
│  └─ index.js          canonical checked-in Worker entry
├─ migrations/
└─ server/              Nitro server routes, middleware, runtime adapters
```

`backend/worker/index.js` is the stable Cloudflare boundary. It delegates to the generated Nitro application handler at `../.output/server/index.mjs`; generated output is implementation detail, not deployment ownership.

From `apps/local-studio/`:

```sh
npm ci
npm run build
npm run cf:verify-output
npm run cf:dry-run
npm run cf:deploy
```

Production Worker: `agentsam-sdk` at `https://agentsam.inneranimalmedia.com`. The workers.dev route is disabled.

<!-- agentsam:trademark-notice -->
> Independent project. Not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. or by any other company whose products are named here. Cloudflare is a registered trademark of Cloudflare, Inc. Other names are trademarks of their respective owners. See [TRADEMARKS](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/TRADEMARKS.md).
