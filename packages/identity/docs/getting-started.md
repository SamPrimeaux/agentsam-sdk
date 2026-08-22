# Getting started with identity (`@inneranimalmedia/agentsam-sdk`)

1. Install: `npm install @inneranimalmedia/agentsam-sdk@alpha`
2. Preview auth portal locally (1:1 IAM HTML): `npx agentsam identity preview --open`
3. Wire Worker routes for OAuth callback + session cookie (adapter sprint — D1/IAM adapters not in alpha yet)

Full plan: Phase 1–9 in IAM `plans/active/AGENTSAM-IDENTITY-SDK-PRODUCTIZATION-2026-08.md`

```js
import { createIdentityClient, GoogleProvider } from '@inneranimalmedia/agentsam-sdk';

const identity = createIdentityClient({
  providers: [GoogleProvider],
  portal: { brand: { name: 'Your App', logoUrl: '/logo.svg' } },
});

// Alpha: contracts + providers + preview. Server runtime (login/session) requires adapter — throws until wired.
identity.providers.google();
```

Subpath imports (providers, OAuth callback):

```js
import { GoogleProvider } from '@inneranimalmedia/agentsam-sdk/identity/providers/google';
import { finalizeInboundOAuth } from '@inneranimalmedia/agentsam-sdk/identity/oauth/callback';
```
