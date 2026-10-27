# @inneranimalmedia/agentsam-provider-completeful

**Canonical, installable Completeful Partner API integration.**

The Completeful integration is implemented once as **strict TypeScript** in
`src/core/client.ts`, with operation and request/response types generated from
`openapi/openapi.json` (currently API version 0.1.0: **55 operations / 44 paths /
36 schema types**). TypeScript produces the JavaScript that runs on Node and
Cloudflare Workers. No second JavaScript API implementation is maintained.

## Install and use in any authorized website

**Current development state:** the 2.6.14 package is an **unpublished release candidate**.
Do not attempt to install 2.6.14 from the public npm registry yet.

Fuel n Free Time currently consumes a verified compiled package using
`file:vendor/agentsam-provider-completeful`; its ordinary npm installation
works offline and does not require npm publication or the SDK source checkout.
Once the SDK release is published, new installations can run:

```bash
npm install @inneranimalmedia/agentsam-provider-completeful
```

```ts
import { createCompletefulClient } from '@inneranimalmedia/agentsam-provider-completeful/api';

// Credential source, account/shop authorization and product orders are
// controlled by each website or the hosting platform, never the SDK.
const completeful = createCompletefulClient({
  apiKey: secrets.completefulApiKey,
  allowLiveWrites: false,
});

const { data: catalog } = await completeful.api.catalog.products({query:{limit:20}});
const { data: mockups } = await completeful.api.catalog.mockups({
  path:{productId:'supplier-catalog-product-id'},
});
const render = await completeful.api.mockups.render({
  body:{mockup_id:'real-mockup-uuid',art_url:'https://media.example.com/ready-print.png'},
  idempotencyKey:'approved-print-artwork-revision-and-mockup',
});
```

API methods are statically typed and runtime-checked against the pinned
operation contract (required path/query/body properties, allowable query names,
live-write gate). This is not a full response JSON-schema validator: consumers
must still handle missing/invalid provider response fields and network failures.

**Supplier writes must remain under host authorization.** The SDK does not know
which account is authorized for a shop, whether a billable order is approved,
or whether artwork is print ready. Only the host can enforce those policies.

## Build, types and test

```bash
npm run generate -w @inneranimalmedia/agentsam-provider-completeful
npm run build -w @inneranimalmedia/agentsam-provider-completeful
npm run typecheck:consumer -w @inneranimalmedia/agentsam-provider-completeful
npm test -w @inneranimalmedia/agentsam-provider-completeful
```

- `src/core/`: canonical typed transport, errors and operation facade.
- `src/core/generated/`: generated definitions; never edit manually.
- `src/client.js`: compatibility export for already-installed AgentSam tools.
- `src/tools.js`, `webhooks.js`, `events.js`: existing orchestration adapters;
  the website owns application authorization and persistence.
- `dist/`: compiled release output included in the published package.

The FNF pilot currently consumes a pinned compiled snapshot of this SDK via
`fuelnfreetime/vendor/agentsam-provider-completeful`. The FNF sync task
verifies the OpenAPI SHA-256 and compiled output hashes. Its only local provider
code handles application credentials/tenant identity and HTTP route authorization.
When this SDK release is published, that snapshot can be replaced with the normal
package dependency without rewriting Product Studio.

To add a new supplier endpoint: update the pinned OpenAPI and operation mapping,
regenerate types, run the type tests, and publish a new SDK package version.
