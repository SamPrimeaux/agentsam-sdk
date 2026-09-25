# Identity schema mapping — portable ↔ Cloudflare D1

Portable SQLite (`packages/identity/migrations/sqlite/`) is the product schema.
The D1 adapter maps existing hosted table names without requiring a big-bang rename.

| Portable (SQLite) | Hosted D1 (current) | Notes |
|---|---|---|
| `identity_users` | `auth_users` | Same columns |
| `identity_external_accounts` | `account_identities` | `user_id` ↔ `account_id` |
| `identity_sessions` | `auth_sessions` | Same columns |
| `identity_auth_events` | `auth_event_log` | Same columns |
| `identity_oauth_transactions` | `identity_oauth_states` → migrate to `identity_oauth_transactions` | Requires `app_id NOT NULL`; no silent pre-app_id fallback |
| `identity_provider_connections` | (new / connector tables) | `credential_ref` → vault/KMS; never store raw tokens in D1 rows |
| `identity_app_registry` | cache of `agentsam.app.json` | Disk manifests remain SSOT |
| `identity_route_registry` | projection cache | Disk manifests remain SSOT |
| `identity_oauth_clients` … | optional `identity.oauth-server` pack | Only if product is an AS |

## Schema version

Both adapters read `identity_schema_meta.schema_version` (SQLite) or
`PRAGMA`/meta row. Missing `app_id` on OAuth transactions is an
`IdentitySchemaError('IDENTITY_SCHEMA_MIGRATION_REQUIRED')`, not a soft
downgrade.

## Packs

| Pack | Apply when |
|---|---|
| `identity.core` | Always (local + hosted) |
| `identity.oauth-client` | Signing into external IdPs |
| `identity.oauth-server` | Product issues its own codes/tokens |
