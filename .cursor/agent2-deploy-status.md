# Agent 2 deploy status — Media/nav spine

**Timestamp (UTC):** 2026-11-01T01:39:47Z  
**Host:** https://agentsam.inneranimalmedia.com  
**Method:** merge PR → `apps/local-studio` Cloudflare deploy

## Git / PR

| Item | Value |
| --- | --- |
| Branch (source) | `fix/notification-inbox-native-20261031` |
| Agent 2 commits | `b6186f83` (theme/nav/Media routes), `eeb28476` (nav contract docs) |
| PR | https://github.com/SamPrimeaux/agentsam-sdk/pull/415 (MERGED) |
| Merge commit on `main` | `17cfcbc7` |
| Prior note | PR #412 merged notifications only; Agent 2 Media/nav commits were still branch-only until #415 |

## Deploy

| Item | Value |
| --- | --- |
| Script | `cd apps/local-studio && npm run cf:build` (preflight) then `cf:ensure-vault` + `node scripts/deploy-cloudflare.mjs` |
| Worker | `agentsam-sdk` (`backend/wrangler.jsonc`) |
| Custom domain | `agentsam.inneranimalmedia.com` |
| Cloudflare Version ID | `c6d2c1db-f766-4f0f-b0f3-b6db5d11a9c2` |
| Deploy git tag/message | `git_sha=17cfcbc7b486d9a9d2c4129eebdbedcb02cb38cf` |
| Assets uploaded | 103 new/modified (incl. `MediaLibraryPage-*`, `/studio-app-shell/media/*`, navigation.json) |

## Hosted smoke (curl, unauthenticated)

| URL | Result | Pass? |
| --- | --- | --- |
| `/media` | `302` → `/auth/login?next=%2Fmedia` — **does not** go to `/admin/moviemode` | PASS |
| `/media/images` | `302` → `/auth/login?next=%2Fmedia%2Fimages` | PASS |
| `/media/videos` | `302` → `/auth/login?next=%2Fmedia%2Fvideos` | PASS |
| `/media/models` | `302` → `/auth/login?next=%2Fmedia%2Fmodels` | PASS |
| `/media/files` | `302` → `/auth/login?next=%2Fmedia%2Ffiles` | PASS |
| `/admin/moviemode` | `302` → `/auth/login?next=%2Fadmin%2Fmoviemode` (Apps destination intact) | PASS |
| `/admin/content` | `302` → `/media` | PASS |
| `/admin/content?kind=image` | `302` → `/media/images` | PASS |

### Auth note

No authenticated browser session was available in this agent run. Unauthed redirect chains preserve the Media `next=` path (not MovieMode). Local worker smoke also confirmed the same redirect map before deploy.

## Local worker smoke adjustments

`apps/local-studio/scripts/smoke-worker-routes.mjs` updated so deploy gate matches Agent 2 behavior:

- Products copy assertion: `Manage catalog items` → `Store Products`
- `/admin/content` (+ kind) expected `302` into `/media*`
- Added `/media*`, `/admin/moviemode` checks

## Agent 1 WIP

Uncommitted Agent 1 work (cfoa/media, work surfaces, package.json, etc.) was stashed as:

`stash@{0}: agent1-wip-preserve-before-agent2-deploy-20261031203510`

Restore after this deploy commit with `git stash pop` on the working branch (do not drop).

## Pre-deploy baseline (for comparison)

Before deploy, prod had `/media` → `301` `/admin/moviemode` (OLD). That regression is cleared.
