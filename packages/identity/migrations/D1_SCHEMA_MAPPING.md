# Identity schema mapping — portable ↔ Cloudflare D1 (IAM compat)

Portable SQLite (`packages/identity/migrations/sqlite/`) is the product schema.
The IAM-compat adapter maps existing hosted table names without requiring a big-bang rename.

| Portable (SQLite / portable D1) | Hosted D1 (IAM compat) | Notes |
|---|---|---|
| `identity_users` / account plane | **`accounts`** + `auth_users` | **Account SSOT** — row of record |
| `identity_external_accounts` | `account_identities` | IdP linkage only |
| `identity_sessions` (+ `type`) | `auth_sessions` (+ `type`) | browser / desktop |
| `identity_auth_events` | `auth_event_log` | Same semantics |
| `identity_oauth_transactions` (+ native cols) | `identity_oauth_states` | Requires `app_id NOT NULL`; native cols optional |
| `identity_native_handoffs` | `identity_native_handoffs` | Single-use desktop pickup |
| `identity_companies` | `company` | Branding / host resolution |
| `identity_provider_connections` | `identity_provider_connections` (or connector tables) | `credential_ref` only — never raw secrets |
| `identity_app_registry` | cache of `agentsam.app.json` | Disk manifests remain SSOT |
| `identity_route_registry` | projection cache | Disk manifests remain SSOT |
| `identity_oauth_clients` … | optional `identity.oauth-server` pack | Only if product is an AS |

Password recovery is **not** a portable core table. It uses `createPasswordResetService` with an injected `{get,put,delete}` store. Optional `identity.recovery` pack may exist later.

## Schema version

Portable adapters read `identity_schema_meta.schema_version`. Lane 1 requires version **2** (after `005_identity_company_native.sql`). Missing `app_id` on OAuth transactions is an `IdentitySchemaError`, not a soft downgrade.

## Packs

| Pack | Apply when |
|---|---|
| `identity.core` | Always (local + hosted portable) |
| `identity.oauth-client` | Signing into external IdPs |
| `identity.oauth-server` | Product issues its own codes/tokens |

Family manifest: `packages/identity/schema/agentsam.identity/manifest.json`
Generic contract: `protocol/database/agentsam.schema-pack.v1.schema.json`
