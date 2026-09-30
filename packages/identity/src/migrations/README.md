# Identity migrations under `src/migrations/` — IAM-compat scaffold / history

**This tree is NOT the portable customer D1 authority.**

| Path | Authority |
|---|---|
| `packages/identity/migrations/sqlite/` | **Portable** `identity_*` SQL SSOT (`agentsam.identity` pack) |
| `packages/identity/src/migrations/` | **IAM-shaped** scaffold / history (accounts, auth_users, company, …) |

## When to use which

| Audience | Adapter | Schema |
|---|---|---|
| New customer clean D1 / local SQLite | `createSqliteIdentityAdapter` / `createPortableD1IdentityAdapter` | Portable pack via `applyPortableIdentityMigrations` |
| Existing InnerAnimalMedia / Local Studio hosted DB | `createIamCompatIdentityAdapter` (`createCloudflareD1Adapter` alias) | Live IAM tables — do not rename for portability |

## IAM-shaped tables in this directory

| Table | Purpose |
|-------|---------|
| `accounts` | Account SSOT on hosted IAM |
| `auth_users` | Login principal |
| `auth_sessions` | Browser/desktop sessions |
| `account_identities` | IdP linkage |
| `oauth_states` | Historical PKCE/state (note: missing `app_id` vs portable invariant) |
| `password_reset_tokens` | Historical SQL reset tokens — runtime recovery uses KV/`createPasswordResetService` |
| `company` | Hosted branding table |

New generic scaffolds must be generated from the **portable** `agentsam.identity` pack, not by copying this tree as “portable D1.”

Preserve these files for IAM-compat fixtures and historical feature resources. Do not delete until Lane 1 parity is proven and call sites no longer need them.
