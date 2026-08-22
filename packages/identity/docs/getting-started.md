# Getting started with @agentsam/identity

1. Install: `npm install @agentsam/identity`
2. Configure providers and storage adapter
3. Wire Worker routes for OAuth callback + session cookie

Full plan: Phase 1–9 in IAM `plans/active/AGENTSAM-IDENTITY-SDK-PRODUCTIZATION-2026-08.md`

```js
import { createIdentity, GoogleProvider } from '@agentsam/identity';

const identity = createIdentity({
  providers: [GoogleProvider],
  storage: { adapter: 'cloudflare-d1', binding: 'DB' },
});
```
