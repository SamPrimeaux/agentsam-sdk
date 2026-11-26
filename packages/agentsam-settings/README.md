# @inneranimalmedia/agentsam-settings

Portable Settings contracts and React UI for AgentSam applications. Hosts supply runtime/account/provider state through `SettingsHost`; the package does not own a parallel settings database.

## Publisher and plugin icons

`SettingsDiscoveredPlugin.iconUrl` is the product's own packaged PNG icon.
`publisherIconUrl` is an optional, catalog-owned SVG publisher mark, validated to the same
HTTPS origin and `/catalog/icons/*.svg` path as the discovered catalog (without query strings).
The UI renders the publisher mark via CSS masks and `currentColor`, so one vector
is readable in light and dark host themes. It does not override the plugin's own icon.
The OAuth broker passes only this validated publisher mark to IAM dynamic OAuth client
registration for AgentSam Studio branding; plugin identity and OAuth client identity
are separate. Never treat untrusted catalog artwork as authorization evidence.

## Exports

- `@inneranimalmedia/agentsam-settings` — public shell and contracts
- `@inneranimalmedia/agentsam-settings/contracts` — host/snapshot contracts
- `@inneranimalmedia/agentsam-settings/frontend` — React settings product UI
- `@inneranimalmedia/agentsam-settings/fixtures` — deterministic fixture hosts for tests/previews


## UI quality release gate

The host and desktop share the same component implementation. Run
`npm run quality:ui` from the SDK root before releasing Settings changes.
This runs changed-source accessibility/style checks, the desktop stylesheet
build and seven-width real-browser checks. The machine-readable v1 quality
receipt contract is in `protocol/ui/agentsam.ui-quality.v1.schema.json` and
its acceptance/limitations are in `docs/product/AGENTSAM-UI-QUALITY-GATE.md`.
A passing Settings receipt does not certify unrelated CMS themes.


## Verified account billing and tool costs

The `usage` unit has two **separate** authorities:

- `SettingsBillingPanel` uses optional `SettingsHost.readBilling()` and
  `openBillingPortal()`. The host must read authenticated, account-scoped
  billing records; the package never stores payment credentials or claims a
  successful payment after redirecting. A missing host integration or failed
  read is explicitly unavailable. In Local Studio web, the adapter looks for
  `GET /api/billing`, `GET /api/billing/invoices`, and a POST-created
  `/api/billing/portal` session. The separate InnerAnimalMedia billing
  backend already implements those endpoints, but they are not assumed to
  exist on every Local Studio deployment.
- `normalizeVerifiedToolUsage()` accepts only the authenticated account
  `agentsam.tool-usage.v2` receipt with a matching recorded/priced-call
  count from the existing `/api/analytics/tool-usage?range=30d` endpoint.
  This represents **recorded tool costs**, not total provider/model/cloud
  bills. Unpriced calls do not become zero-cost charges, and the account
  ledger is read only after server-side session authorization.

The CMS has a first-party `customer_billing` manifest entry that installs
through the existing site-scoped `catalog-resources` API into canonical
`cms_page_sections` / `cms_section_blocks`. The editor's payment preview
cannot collect funds; hosts must supply an authenticated route to render the
portal link. Installation alone is **not proof of a live published renderer**.

Do not turn either provider data or a CMS theme setting into an authorization
source. Payment processing, subscription activation, and invoice settlement
require server-verified transactions and webhooks.

## Storage & providers

The Storage unit renders SettingsStoragePanel from SettingsSnapshot.storage
and SettingsHost.updateStoragePreference with host-authorized navigation.
Provider identity uses bundled recognizable vector marks rather than remote
icon fetching. Cloudflare's R2, Images and Stream glyphs come from
[Cloudflare Docs](https://github.com/cloudflare/cloudflare-docs/tree/production/src/icons);
Google Drive, GitHub and Supabase from [Simple Icons](https://github.com/simple-icons/simple-icons)
(CC0); the AWS mark comes from [Font Awesome Free Brands](https://github.com/FortAwesome/Font-Awesome)
(CC BY 4.0). Trademarks remain the property of their respective owners.

In Local Studio, GET/PUT /api/settings/storage reads/writes only non-secret
location preferences in the existing account-scoped
user_storage_provider_preferences table. The authenticated IAM account
session is the principal, not workspace or request-body IDs. Cloudflare
capabilities are projected from authenticated /api/connections/cloudflare/resources
discovery; R2, Images and Stream are evaluated independently. The existing
Plugins/Keys settings remain credential and authorization authorities.
An OAuth row, saved location, or browser API is not proof of a successful
provider read/write or a durable backup.

Supported configuration surfaces: R2, S3 and S3-compatible, Google Drive,
Supabase Storage, GitHub repository path, OPFS, and device folders. Cloudflare
Images and Stream are distinct capability cards using the same Cloudflare
grant. This slice does not claim new S3, Google Drive, Supabase, or device
upload/write implementation. Provider-adapter operations require their own
capability checks.

## Standalone package preview

The package includes a runnable reference host at `examples/standalone`. From the
monorepo, run:

```bash
npm --prefix packages/agentsam-settings run dev:preview
```

Then open `http://127.0.0.1:4173`. The preview is built against the package's
`dist` output and demonstrates the Settings shell, URL-driven unit/view state,
first-run/populated/degraded host fixtures, and the independently exported
`BrandPluginWorkspace`. Its example brand and provider records are synthetic;
they are not persisted and do not use live OAuth credentials.

The Settings package bundles its Workbench widgets and Brand workspace implementation at build time; consumers do not need a separate Workbench runtime dependency. The shared Contracts package remains an explicit peer for the host/provider type contracts. The Brand workspace is currently read-only: editing and asset mutations must be supplied by host-owned brand APIs and are not implied by this viewer.

The package now ships its compiled utility stylesheet at
`@inneranimalmedia/agentsam-settings/frontend/styles.css`. A host imports that
stylesheet once and supplies its own `SettingsManifest` and `SettingsHost`.
The host owns navigation, session identity, database hydration, OAuth and
provider authorization. The package owns the reusable Settings views and
presents only safe provider-data projections returned by `SettingsHost.readWidgetData`.

### Provider-backed Workbench widgets

The gallery includes read-only Cloudflare Resources, GitHub Activity and Google
Drive Recent Files widgets. Local Studio supplies their data through existing
account-scoped routes:

- Cloudflare Resources: `/api/connections/cloudflare/resources`
- Cloudflare Queue Depth and history: `/api/queues/observability`
- GitHub: `/api/work/connect/github/status` and `/api/work/github/repos`
- Google Drive: `/api/work/connect/google_drive/status` and `/api/admin/media?source=drive`

The Settings and New Tab hosts call these routes with the signed-in same-origin
session. Access tokens remain in the Worker/provider connectors. Other apps can
implement the same `readWidgetData` host contract or leave the widget in its
explicit unsupported/not-connected state; they do not need to adopt Local
Studio's route structure.

Cloudflare Worker Observability remains a concept preview. The connected
Cloudflare widget reports the account's R2, Images and Stream resource inventory;
it does not claim to expose Worker logs or telemetry.
