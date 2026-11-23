# @inneranimalmedia/agentsam-cms

**The only supported AgentSam CMS SDK engine.** The merchant-facing Page Editor,
Theme Studio, storefront delivery, and Apps are owned by
`@inneranimalmedia/ecommerce-cms-agentsam`.

## Source of truth

- No SQL migrations, DDL, runtime catalogs or embedded SQLite schema.
- No `cms_runtime_*`, `cms_sections`, `cms_blocks`, or `sam_cms_*` tables.
- Account, site and actor scope come from the trusted host session.
- The host owns its existing `cms_sites`, `cms_pages`, `cms_page_sections`,
  `cms_section_blocks`, `cms_revisions`, `cms_publications`, `cms_site_themes`,
  `cms_globals` and `cms_assets` relationships.
- D1/R2/host adapters implement durable revisions, atomic CAS, immutable
  publication manifests and rollback. The SDK does not initialize storage.

## Worker service-bridge contract

`@inneranimalmedia/agentsam-cms/studio-bridge-protocol` owns the portable,
short-lived signed Worker-to-Worker request protocol for Ecommerce CMS and
Local Studio. A host must verify the signed-in account, site membership,
site-scoped edit/publish permission and trusted service binding **before**
using this protocol. The receiving Worker independently verifies the HMAC,
project scope, timestamp, method, path, body digest and allowlist. This
module has no storage binding, CMS schema, or authority to publish by itself.
Local Studio and Ecommerce use their existing attached D1/R2 host bindings.

## Runtime entry points

`createCmsOperations()` retains the canonical SDK agent operation vocabulary
(definition discovery, section/block editing, revisions, private preview and
approved publication), including compatibility aliases.

`createMerchantCms()` implements merchant-facing site, page, theme, navigation
and asset domain operations on a host-supplied repository. It validates
page/template/SEO/navigation input, checks site ownership, enforces authorizer
policy and rejects publication without a durable manifest receipt.

```js
import { createMerchantCms } from '@inneranimalmedia/agentsam-cms';

const cms = createMerchantCms({
  repository: ecommerceCmsRepository,
  resolveTrustedContext: resolveSessionAccountSite,
  authorize: authorizeCmsOperation
});

await cms.pages.create({
  title:'About', slug:'about', routePath:'/about', pageType:'page',
  idempotencyKey:requestId
}, requestContext);
```

The repository contract lives in `src/index.d.ts`. Its mutation methods
**must** implement atomic version checks and durable storage using host-owned
tables; successful publication requires an immutable manifest key/hash and a
monotonic release number. The engine cannot fake a live site with a preview.

The old `createNodeSqliteCmsRepository({filename})` constructor has been
retired. There is no fallback local CMS schema when a host adapter is missing.

## Acceptance

`npm --prefix packages/agentsam-cms test` validates package contracts and
injected-repository behavior. A real launch also requires the ecommerce
CMS host's multi-tenant D1/R2 adapter and end-to-end Page Editor, Theme Studio,
publication, rollback and storefront tests. SDK tests alone do not establish
deployed product readiness.

## Contract boundary

CMS operation declarations in `src/contracts.js` are CMS semantics, not a second
portable operation format. They extend `AgentOperationContract` from
`@inneranimalmedia/agentsam-contracts` with the CMS-owned effect vocabulary and
CMS-specific input/output schemas. The machine projects the shared portable
metadata into SAM handlers; authorization, revision rules, section/block
composition and publication behavior remain CMS-owned.

The package depends on `@inneranimalmedia/agentsam-contracts` for its public
operation and JSON Schema types. It does not copy or redefine the shared
operation/tool vocabulary.
