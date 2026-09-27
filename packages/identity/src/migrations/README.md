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

Existing scaffolds missing `accounts`: also apply `0003_accounts_ssot.sql`.

## Tables

| Table | Purpose |
|-------|---------|
| `accounts` | **Account SSOT** — row of record (`au_*` ids shared with auth_users in portable scaffold) |
| `auth_users` | Login principal (password hash, 1:1 with accounts.id) |
| `auth_sessions` | Browser sessions |
| `account_identities` | IdP linkage only (provider + subject → accounts.id) — **not** the account SSOT |
| `oauth_states` | PKCE/state for OAuth start |
| `password_reset_tokens` | Reset flow (grow when wired) |
| `company` | Branding SSOT — name, logo, colors, support info (`GET /api/company`) |

IAM production tables remain the reference; this schema is **portable and boring** for customer Workers.
