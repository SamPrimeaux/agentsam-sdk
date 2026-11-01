# Completion report — OAuth account selection + Database Studio DDL + Media isolation

| Area | Evidence |
|---|---|
| Account selection | Preferred metadata on `user_oauth_tokens`; `POST /api/connections/cloudflare/select`; Settings picker shipped in `integrations-CVpbHuRN.js` |
| OAuth | Multi-account persist on callback; oauth-persist preferred test passes; no oauth-mode env account fallback |
| DDL | `POST /api/database/ddl`; Create Table UI; disposable SQLite CREATE/INSERT/SELECT/DROP proof |
| Database Studio | Acceptance tests + bundled AUTHORIZED DDL UI |
| Media | IAM unbound 503 + default OAuth path isolation tests; Media Library 401/409 handling |
| IAM isolation | Tests with `IAM_API` unbound |
| Deployment | Worker `56b65d7b-19c7-463d-82a7-8671b5d0c21b` · commit `e8a19781` |
| Regressions | 30 targeted tests pass; `node --check` on edited workers |

## Remaining failures

| Item | Root cause | Component | Next action |
|---|---|---|---|
| Authenticated multi-account UI smoke | No production session cookies in agent environment | Settings Integrations | Sign in to Studio → Integrations → select account → refresh |
| Authenticated disposable D1 Create Table | Same session gate; needs writable OAuth D1 | Database Studio | Sign in → select disposable D1 → Create Table `studio_ddl_test_*` → insert/select → DROP |
| Live Media resource listing | Same session gate | Media Library | Sign in → Media → confirm Images/Stream/R2 for preferred account |

`pwa-build-meta.json` 404 on Studio origin is nonessential (see `docs/studio/pwa-build-meta-agentsam-note.md`).
