# Portable Identity Architecture (pre-commit return)

## Invariants

1. Portable SDK owns **semantic route IDs** (`identity.login`), never host paths.
2. App manifests own **HTTP projections**.
3. Auth-capable apps MUST declare authenticated / login / recovery / OAuth callback.
4. OAuth **transactions** persist `app_id` + `return_to` (required).
5. Post-login: valid `return_to` → authenticated entry → recovery+error → **throw** (never `/`).
6. No `DASHBOARD_AFTER_LOGIN_PATH`, no `LOCAL_STUDIO_APP` in identity, no `APP_HOME_PATH` env.
7. Missing shell/route → package verification failure.

## Artifacts delivered

| Deliverable | Location |
|---|---|
| IdentityStore + errors | `packages/identity/src/contracts/identity-store.js` |
| Semantic IDs | `packages/identity/src/contracts/route-ids.js` |
| Route projection | `packages/identity/src/contracts/route-projection.js` |
| Fail-closed post-auth | `packages/identity/src/server/post-auth.js` |
| SESSION_POLICY | `packages/identity/src/core/session-policy.js` |
| SQLite core pack | `packages/identity/migrations/sqlite/001_identity_core.sql` |
| SQLite oauth-client | `packages/identity/migrations/sqlite/002_identity_oauth_client.sql` |
| SQLite oauth-server (optional) | `packages/identity/migrations/sqlite/003_identity_oauth_server.sql` |
| D1 mapping | `packages/identity/migrations/D1_SCHEMA_MAPPING.md` |
| createSqliteIdentityAdapter | `packages/identity/src/adapters/sqlite/index.js` |
| App verify | `packages/identity/src/app/verify-app.js` |
| App auth contract (Local Studio) | `apps/local-studio/agentsam.app.json` |
| Tests | `packages/identity/tests/portable-identity-architecture.test.mjs` |

## Redirect resolution

```
transaction.return_to  →  owned by app?
        yes → use
        no  → app.authenticated
        missing → identity.recovery?error=…
        none → IdentityRoutingError('AUTH_DESTINATION_UNRESOLVED')
```

## Local-only path

```
applySqliteIdentityMigrations(db)  // core + oauth-client
createSqliteIdentityAdapter(db)
createIdentityService({ adapter, app, routeRegistry })
```

Zero Cloudflare / IAM / D1 required for password + session + OAuth transaction store.
Provider secrets → encrypted vault via `credential_ref` on `identity_provider_connections`.
