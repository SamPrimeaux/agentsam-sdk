# #419 deploy status — user OAuth Media Library (no mandatory IAM)

**Timestamp (UTC):** 2026-11-01T02:27:00Z  
**Host:** https://agentsam.inneranimalmedia.com

## Git

| Item | Value |
| --- | --- |
| Commit | `e973f2e9` |
| Message | fix(media): browse user CF Images/Stream/R2 without IAM_API (#419) |
| Issue | https://github.com/SamPrimeaux/agentsam-sdk/issues/419 |

## Behavior change

- Default `/api/admin/media` → **user Cloudflare OAuth** (`provider=cloudflare` / auto)
- **No IAM_API fallthrough** for gallery listing
- Explicit `provider=iam` still available for IAM-owned resources
- `MediaLibraryPage` always requests `provider=cloudflare`
- Paginated `listCloudflareImages` / `listCloudflareStream` in cfoa

## Tests (local)

- `content-media-api.test.mjs` — 11 pass (incl. #419 no-IAM regressions)
- `packages/connectors/cfoa/tests/*.mjs` — 37 pass

## Hosted smoke (unauthenticated)

| Check | Result |
| --- | --- |
| `/media` | `302` → `/auth/login?next=/media` |
| `/api/admin/media?provider=cloudflare&source=cf_images` | `401` JSON (not IAM proxy error) |

## Still required to close #419

1. Signed-in browser: browse real Images, Stream, R2 via OAuth grant
2. Optional staging with `IAM_API` unbound
3. Screenshots into `docs/evidence/media-library-20261031/`

## Not closed by this deploy

Theme authenticated stickiness · project attach/detach · MovieMode E2E · Drive · #418 deeper acceptance
