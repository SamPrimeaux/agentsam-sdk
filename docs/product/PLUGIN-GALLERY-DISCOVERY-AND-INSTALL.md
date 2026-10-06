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

## Remaining v1 connection work

Implement the OAuth authorization callback, secure token custody, tool discovery, scope enforcement and health probes for first-party Brand/Campaign; test real read/write actions with user consent before marking them connected. Repeat for independently hosted third-party catalogs with explicit source approval.
