# AgentSam Campaign data contract v1

Owner: **@inneranimalmedia/agentsam-campaign**. Database engine: SQLite / Cloudflare D1.
This is one canonical, additive campaign schema used by the platform, Ecommerce CMS
AgentSam, Fuel & Free Time, Companions, and other installations. It does not replace
each application's specialized business tables or the public-site CMS.

## Contents

1. \`sql/0001_campaign_core.sql\`: 11 installation-local canonical tables.
2. \`sql/backfill/fuelnfreetime.sql\`: existing \`growth_campaigns\` and generated packs.
3. \`sql/backfill/companions.sql\`: fundraiser campaigns, updates, CMS asset references,
   plus standalone email campaigns.
4. \`sql/backfill/platform.sql\`: no invented campaign seed data; site ownership and
   authorization must be resolved before creating scopes.
5. \`sql/verify.sql\`: portable integrity checks after any migration.

## Canonical ownership

- \`campaign_scopes\`: local authoritative scope keys, resolved by server auth.
- \`campaigns\`: common campaign identity, kind, lifecycle and brief.
- \`campaign_channels\`: selected destinations and channel state.
- \`campaign_materials\`: briefs, generated packs, emails, campaign updates, revisions.
- \`campaign_asset_refs\`: external CMS/R2 media references, never duplicate blobs.
- \`campaign_approvals\`: explicit reviewed revision decisions.
- \`campaign_publications\`: channel execution jobs with idempotency + verified receipts.
- \`campaign_metric_facts\`: observed/snapshot/estimated metrics with provenance.
- \`campaign_source_links\`: stable relationship to original tables and IDs.
- \`campaign_activity\`: auditable CRUD/action history.
- \`campaign_schema_versions\`: local schema version history.

**Scope IDs are database-local, not global login assertions.** The API MUST derive
scope from the authenticated actor + authorized site installation, never from
an untrusted account or tenant field. The same logical customer across different
physical databases resolves through the installation registry, not SQL joins.

## API contract (version 1)

The common API is intended to expose:

\`\`\`text
GET    /api/campaigns/v1/scopes
GET    /api/campaigns/v1/campaigns
POST   /api/campaigns/v1/campaigns
GET    /api/campaigns/v1/campaigns/:id
PATCH  /api/campaigns/v1/campaigns/:id    (If-Match/revision required)
DELETE /api/campaigns/v1/campaigns/:id    (archive by default)
GET    /api/campaigns/v1/campaigns/:id/materials
POST   /api/campaigns/v1/campaigns/:id/materials
POST   /api/campaigns/v1/campaigns/:id/approvals
POST   /api/campaigns/v1/campaigns/:id/publications (idempotency key required)
GET    /api/campaigns/v1/campaigns/:id/publications
GET    /api/campaigns/v1/campaigns/:id/metrics
\`\`\`

These are **target operations**, not a claim that every endpoint is deployed.
Adapter reads normalize \`id/name/kind/status/brief/channels/materials/metrics\`;
writes require per-action capabilities and always use \`scope_id\` in SQL filters.
Publishing requires an approved matching revision, real deployment capability,
a recorded receipt and post-write verification. Sending a test email does not publish.
No guessed readiness, donation totals, email metrics, or social reach.

## Deployment and backfill (not automatic)

1. Backup each specific database and inventory its \`sqlite_master\` schema.
2. Apply \`0001_campaign_core.sql\` to one staging clone of each database first.
3. Apply **only** the matching backfill, in staging, then \`verify.sql\`.
4. Inspect mapping/count discrepancies, check source statuses, assets and approvals.
5. Verify the installed app's authorized API, all routes, write gates and renderer.
6. Repeat with backup/rollback point in production only after signoff. Backfill
   scripts use \`INSERT OR IGNORE\` to be safe on re-runs, but they are
   **one-time seeds**; ongoing sync must use typed source adapters/events.
7. Never rename/drop \`growth_campaigns\`, \`fundraising_campaigns\`,
   \`campaign_updates\`, \`cms_assets\`, \`donations\`, or existing email tables
   until runtime parity, reversibility and real customer publication are proven.

Do not apply the Companions backfill to FNF, or vice versa. The platform backfill
does not create "default" sites or fake campaigns. D1 \`DB\` bindings must target
the authorized installation; no arbitrary DB UUID supplied by the browser.

## Migration semantics

- Canonical IDs are deterministic (e.g. \`growth:<id>\`, \`fundraising:<id>\`,
  \`email:<id>\`) and source mapping is retained.
- A fundraiser's goal/raised amounts are **snapshots** in \`attributes_json\`.
  Donor ledgers remain authoritative.
- Old \`campaign_updates.status='published'\` indicates native content status,
  **not verified website publication**; no invented publication receipt is created.
- FNF metrics are labelled \`legacy_snapshot\`, not authoritative new observations.
- Source email campaigns are not attached to fundraisers without an actual foreign key.
- Avoid backfilling personally identifying recipient/donor records into campaign tables.
- \`campaign_schema_versions\` identifies schema installation, not a successful
  application deployment. Verify actual API and rendered destination separately.
