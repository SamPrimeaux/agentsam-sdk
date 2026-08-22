# Identity D1 migrations

Customer-scoped identity tables for `@inneranimalmedia/agentsam-sdk` identity apps.

## Apply

```bash
# local
wrangler d1 execute <database_name> --local --file=migrations/0001_identity_core.sql

# remote
wrangler d1 execute <database_name> --remote --file=migrations/0001_identity_core.sql
```

`agentsam identity init` copies this migration into the customer project automatically.

## Tables

| Table | Purpose |
|-------|---------|
| `auth_users` | Login identity (`au_*` ids) |
| `auth_sessions` | Browser sessions |
| `account_identities` | OAuth provider linkage |
| `oauth_states` | PKCE/state for OAuth start |
| `password_reset_tokens` | Reset flow (grow when wired) |

IAM production tables remain the reference; this schema is **portable and boring** for customer Workers.
