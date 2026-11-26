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

**Alpha scope:** contracts, D1 adapter, Worker router, `agentsam identity init` scaffold (`app/frontend` + `backend` + migrations), and `agentsam identity preview`. Default OAuth: minted `IAM_CLIENT_ID` + `IAM_CLIENT_SECRET`. BYOK options: Google web, Google Desktop (`GOOGLE_DESKTOP_CLIENT_ID`), GitHub, Cloudflare (`CLOUDFLARE_OAUTH_CLIENT_*`). **Stock CMS sign-in picker:** Cloudflare · Google · Inner Animal Media · ChatGPT (`hosted_headers` via Apps SDK). **Account SSOT:** `accounts` (not `account_identities` — that table is IdP linkage only).

## Layout

```
src/
  core/           identity · sessions · accounts · recovery
  providers/      google · github · gcp · email · iam · cloudflare · chatgpt
  oauth/          authorize/callback (extract from IAM — next sprint)
  adapters/       inneranimalmedia · cloudflare-d1
  contracts/
  frontend/auth-portal/pages/   login · signup · reset (verbatim IAM HTML)
migrations/
examples/legendary-os/
```

## Context ownership

Identity is the only package responsible for authenticated session, provider
sign-in, user/account principal and account membership authority. The account
SSOT remains `accounts`; provider identities remain linked records.

The CMS passes a selected **site/page/section hint** to AgentSam through its
editor adapter, but the browser must **never** supply trusted identity,
credentials, roles, or publication authority. The host authenticates with
Identity, resolves ownership against existing `cms_sites` and
`cms_page_sections`, and only then hands the section data to the assistant.
`agentsam-contracts` describes generic context and tool types, not sessions;
`agentsam-cms` owns page/section semantics, not login or OAuth.

Cloudflare provider sign-in is different from authorizing a customer's
Cloudflare resource connection. The latter goes through
`packages/connectors/cfoa`, where capabilities describe requested grants
and credentials are resolved server-side. CMS users do **not** need to grant
D1 or R2 permissions to edit a site hosted by AgentSam.

The customer-facing `createIdentityClient` login/session methods are still
alpha stubs and throw until a host Identity Service adapter is connected.
A CMS should consume an established authenticated host principal, not
attempt to call an unwired browser SDK method.

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

<!-- agentsam:trademark-notice -->
> Independent project. Not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. or by any other company whose products are named here. Cloudflare is a registered trademark of Cloudflare, Inc. Other names are trademarks of their respective owners. See [TRADEMARKS](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/TRADEMARKS.md).
