# AgentSam Plugin Gallery — Discovery and Installation

Date: 2026-10-06
Status: Catalog discovery, account registration, and IAM OAuth-mediated tool authorization are implemented and integration-tested. A fresh-account live browser/OAuth smoke and independent external-host smoke remain release gates.

## Authorities

- @inneranimalmedia/agentsam-settings owns portable visual UI and host contracts, not provider credentials or execution.
- The public agentsam-plugin-mcp Worker owns manifest-driven discovery for Brand, Campaign and future real published plugin products.
- Local Studio owns account-scoped installations and uses existing D1 plugin registry records.
- Provider connections and their verified tool runtime remain separate, permissioned authorities.

## User states

| State | Meaning |
| --- | --- |
| Available | Verified source manifest; not installed on account |
| Needs connection | Account registration exists, but no verified OAuth/tool connection |
| Connected | The verified runtime reports healthy, enabled and has registered tools |

Publishing an MCP endpoint, storing an installation, and authenticating working tools are distinct gates.

## Catalog source trust

Configure Worker variable AGENTSAM_PLUGIN_CATALOG_URLS as a JSON list of owned, reviewed HTTPS catalog URLs, such as a first-party https://YOUR_PLUGIN_HOST/catalog/plugins. No third-party endpoint is hardcoded in the portable Settings package.

- Maximum 8 configured sources.
- Only HTTPS catalog URLs ending in /catalog/plugins; no redirects, localhost/private IP literals or embedded credentials.
- Catalog schema agentsam.plugin-catalog/v1; 150 entries and 256 KiB maximum per source; 6s request timeout.
- Every plugin key must be unique. MCP endpoint must be on the same source origin, with /mcp prefix.
- Only Streamable HTTP with OAuth is registered in this slice.
- Icon URLs must be same-origin catalog icons; provenance, tools, skills and example prompts come from actual manifests.
- Adding another verified catalog source does not require new Settings UI code.

## Local Studio API

| Method | Route | Function |
| --- | --- | --- |
| GET | /api/plugins/catalog | Authenticated catalog and account installation projection |
| POST | /api/plugins/install | Account-owned install using plugin_key only |
| PATCH | /api/plugins/:id | Existing enable/visibility preferences |
| DELETE | /api/plugins/:id | Remove catalog-v1 registration, refusing active tool rows |
| POST | /api/plugins/tools/execute | Existing permissioned tool runtime; unchanged |

Install never registers executable tool definitions from remote JSON. New records start disabled, composer-hidden and unconfigured. Connection and approved tool registration are separate.

Hosted browsers use same-origin HTTP. Desktop uses the same authenticated Worker via a constrained native bridge.

## Gallery design

Installed shows actual account registry state. Discover searches the verified public catalog, with categories, publisher, capabilities, actual manifest icons, legal metadata, example prompts, and account-scoped Add to Studio / Remove actions. A catalog failure is visible rather than replaced with fake sample plugins.

Copy prompt and Copy MCP endpoint work without pretending remote tools can already execute. Existing Cloudflare setup and disconnect controls remain.

## Adding future or custom plugins

1. In agentsam-plugin-mcp, run: npm run plugin:create -- agentsam-example --title "AgentSam Example".
2. Generator creates a non-publishable draft with manifests, skill placeholder and promotion checklist.
3. Implement a portable domain package, then actual MCP handlers, scopes, OAuth, evaluation suite and endpoint.
4. Add real route/tool catalog. Promote the draft into plugins/ only when real and testable.
5. Run npm run catalog:generate, npm run test:all, merge, and deploy from clean main.
6. The host discovers it automatically from the updated trusted catalog.

Third-party ChatGPT plugins without compatible public MCP endpoints, credentials and permissions cannot be made usable merely by importing their name/icon.

## Host configuration and third-party onboarding

`apps/local-studio/backend/wrangler.jsonc` owns the first-party catalog source in the deployment configuration:

```json
"AGENTSAM_PLUGIN_CATALOG_URLS": "[\"https://agentsam-plugin-mcp.meauxbility.workers.dev/catalog/plugins\"]"
```

The Worker treats this string as a JSON list of reviewed HTTPS sources. Each additional compatible provider can be added to that list **after operator review** and without touching the portable Settings UI. Preserve the first-party source when extending the array; a deploy must not silently reset the catalog. The app's catalog-validation test protects the baseline.

An external provider must publish a compatible `agentsam.plugin-catalog/v1` feed with same-origin `/mcp` endpoint, Streamable HTTP transport, and OAuth authorization. Installation only creates a disabled account registration. OAuth authorization, authenticated MCP tools/list registration, health verification, and explicit write approvals happen separately. Unsupported third-party ChatGPT apps, OAuth schemes, or arbitrary MCP URLs must not be surfaced as ready-to-use plugins without a compatible adapter.

User journey:

1. Browse verified plugin catalog, inspect real permissions/tools and publisher.
2. Add to Studio (creates account-scoped installation with no executable authority).
3. Connect using provider OAuth; grant only requested scopes.
4. Verify active registered tools and health; only then show **Connected**.
5. Execute an approved read operation; require explicit review for permitted write operations.
6. Disconnect/revoke; verify tools are no longer executable.

### Release verification

- `node --test apps/local-studio/scripts/plugin-catalog-config.test.mjs` proves the deployed source configuration is present.
- `node apps/local-studio/scripts/plugin-discovery.test.mjs` proves URL/trust validation, generic multi-catalog composition and account-scoped installation.
- `node apps/local-studio/scripts/plugin-oauth-integration.test.mjs` covers OAuth, identity matching, registered tool scopes and approved writes.
- `npm run typecheck --prefix packages/agentsam-settings` and `npm run test --prefix packages/agentsam-settings` verify the portable UI.
- **Still required before claiming live customer readiness:** deploy the reviewed changes, run Brand/Campaign OAuth on a fresh real account, verify `tools/list` and one read call, test a write with approval and its denial, then independently connect one reviewed third-party compatible MCP catalog.

Do not conflate passing local integration tests, successful installation, and a genuinely verified live user connection.
