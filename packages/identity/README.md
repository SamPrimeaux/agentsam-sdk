# Identity (`packages/identity`)

**Package #1** inside `@inneranimalmedia/agentsam-sdk` — not a separate npm product.

```
inneranimalmedia (reference) → agentsam-sdk (product) → Legendary-OS (first external proof)
```

## Customer API

```js
import { createIdentityClient } from '@inneranimalmedia/agentsam-sdk';

const identity = createIdentityClient({
  portal: { brand: { name: 'Legendary OS', logoUrl: '/logo.svg' } },
});

identity.providers.google();
identity.login(request);   // → Identity Service (server-side)
identity.session.fromRequest(request);
```

## Layout

```
src/
  core/           identity · sessions · accounts · recovery
  providers/      google · github · gcp · email
  oauth/          authorize/callback (extract from IAM — next sprint)
  adapters/       inneranimalmedia · cloudflare-d1
  contracts/
  frontend/auth-portal/pages/   login · signup · reset (verbatim IAM HTML)
migrations/
examples/legendary-os/
```

## SDK philosophy

Ship: contracts, clients, adapters, scaffolding.

Do **not** ship in the client bundle: password DB logic, OAuth secrets, D1 assumptions.

## Publish

`npm publish @inneranimalmedia/agentsam-sdk@2.0.0-alpha.identity` (root package includes `packages/identity`).

## IAM design lab

`inneranimalmedia/packages/agentsam-identity/` — contracts experiments only; **not** the package owner.
