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
identity.login(request);   // alpha: throws until Identity Service adapter is wired
identity.session.fromRequest(request);  // alpha: throws until adapter is wired
```

**Alpha scope:** contracts, D1 adapter, Worker router, `agentsam identity init` scaffold (`app/frontend` + `backend` + migrations), and `agentsam identity preview`. Default OAuth: `IAM_CLIENT_ID` + `IAM_CLIENT_SECRET` (IAM platform). Optional BYOK: `GOOGLE_*` / `GITHUB_*`.

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

## Publish (alpha)

From `main` after tests pass:

```bash
npm test
npm publish --tag alpha
```

Install in a customer app:

```bash
npm install @inneranimalmedia/agentsam-sdk@alpha
# or pin: @inneranimalmedia/agentsam-sdk@2.0.0-alpha.identity.1
```

Subpath imports:

```js
import { createIdentityClient } from '@inneranimalmedia/agentsam-sdk';
import { GoogleProvider } from '@inneranimalmedia/agentsam-sdk/identity/providers/google';
import { finalizeInboundOAuth } from '@inneranimalmedia/agentsam-sdk/identity/oauth/callback';
```

Local preview before client integration:

```bash
npx agentsam identity preview --open
```

Greenfield app (boring scaffold):

```bash
npx agentsam identity init --name my-app --brand "My App"
```

## IAM design lab

`inneranimalmedia/packages/agentsam-identity/` — contracts experiments only; **not** the package owner.
