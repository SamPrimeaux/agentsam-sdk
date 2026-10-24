# Campaign data contract v1

This is the **public, installation-neutral** SQLite / Cloudflare D1 schema
for `@inneranimalmedia/agentsam-campaign`. It contains no installation-specific
table mappings, data extracts, client migrations, production snapshots, or seed
records. Data management belongs to each authorized installation, not this
SDK's source tree or npm distribution.

## Published schema files

- `0001_campaign_core.sql` — additive, reusable tables for campaign scopes,
  campaigns, channels, materials, external asset references, approvals,
  publication receipts, evidence-backed metrics, source links, and activity.
- `verify.sql` — generic integrity checks. Its output applies only to the
  database against which it is intentionally executed.

## Portable API and code

- `../src/storage.js`: scope-authorized CRUD with revision-checked updates
  and archive, plus read models for materials, metrics and publications.
- `../src/http.js`: a uniform `/api/campaigns/v1` read/CRUD surface.
- `../src/project.js`: planning projects and generic draft conversion.

The runtime must supply an authenticated, authorized installation context:
database binding, scope, actor and capability grant. The SDK must never
accept a client-supplied database ID or scope as authorization.

Data-management processes separately handle installation-specific import,
mapping, reconciliation, backfill and rollback. Those artifacts, including
metadata that identifies a particular client, must **not** be checked into
the reusable SDK or included in published npm packages, archives or demos.

Approval/publish operations require capability checks, channel-specific
adapters, signed execution evidence, idempotency and post-write receipts.
The schema alone does not constitute a deployed publishing integration.

## Distribution guard

Before publishing, run `npm test` and `npm run pack:check` in the package.
The package check enforces an allowlist of generic SQL files and rejects
installation-specific source mappings or customer-branded payload helpers.
