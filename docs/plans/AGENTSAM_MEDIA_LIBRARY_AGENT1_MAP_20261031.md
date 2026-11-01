# AgentSam Media Library — Agent 1 implementation map (2026-10-31)

Two-agent sprint. Agent 1 owns Cloudflare OAuth/media capability, R2/Images/Stream/Drive galleries, `/media` destinations, MovieMode packages, Work project gallery associations. Agent 2 owns shell/nav/theme/ecommerce wrapper.

## Current state (inspected)

| Area | Finding |
|---|---|
| `/media` | WIP already remounts `MediaLibraryPage` (was MovieMode). Keep this contract. |
| `/admin/moviemode` | WIP mounts `MovieModeSurface` directly. Correct. |
| `/media/edit` | Redirects to `/admin/moviemode/edit`. |
| `/media/{images,videos,models,files}` | New route files exist; body still wraps Content Studio. |
| CF OAuth | Connect/callback/vault/disconnect complete. **No** user-grant discovery for R2/Images/Stream yet. |
| Media API | `content-media-api.js` proxies `IAM_API`; ignores user OAuth grant. |
| ArtifactsSurface | Best Work gallery base; missing video/audio/model kinds + focused viewer. |
| Nav | WIP in `studio-navigation.mjs` already points Media → `/media` children (Agent 2 owns labels). |

## Route contract (do not fight Agent 2)

- `/media` — Universal Media Library (NOT MovieMode)
- `/media/images|videos|models|files` — filtered gallery views
- `/admin/moviemode` — MovieMode under Apps
- `/admin/content(?kind=)` → `/media…` (legacy)
- `/media/edit` → `/admin/moviemode/edit`
- `/artifacts` remains Work alias

## Slice order

### A — Cloudflare account connection
1. `packages/connectors/cfoa/src/families/media.js` — discover accounts, R2 buckets (list only), Images + Stream availability via OAuth client.
2. `GET /api/connections/cloudflare/resources` (+ optional bucket object list with cursor).
3. Persist requested scopes in OAuth state; stop falling back to host defaults when token omits `scope`.
4. Surface resource health in Media Library + Integrations (connect / needs_scope / empty / error).
5. Do **not** copy assets; browse in place. Tokens stay server-side.

### B — Canonical Media Library
1. Finish route split (tests + MovieModeSurface nav only to `/admin/moviemode`).
2. Stage `/studio-app-shell/media` (+ children) in `stage-settings-shell.mjs`.
3. Polished gallery: thumbnail grid/list, kind filters from route, provider filters, selection/viewer, honest empty/error.
4. Identity by provider ids (CF Images id, R2 bucket/key, Stream uid) — never filename conflation.
5. Fix Content Studio “Open MovieMode” → `/admin/moviemode`.

### C — Project Gallery
Extend ProjectDetailSurface Gallery tab: attach/remove association without deleting source; cover from library; open shared viewer. Audit `media_assets` / Work snapshot before migrations.

### D — MovieMode polish
Remove prototype “Browser-local / CoPro” footers; keep samples labeled honestly; editor import from library later.

## Agent 2 wiring still required

See `.cursor/agent1-route-needs.md` if present. Minimum:

- Keep primary nav Media → `/media` (not film/MovieMode).
- `AgentSamShell` `isMovieModeRoute` must **not** treat `/media` as MovieMode (WIP already corrects this — Agent 2 owns the file).
- Side Stage “media” tab may stay MovieMode preview; full-screen Open should prefer `/admin/moviemode` once Media owns `/media`.

## Out of scope / hard rules

- No second Media Library prototype app.
- No npm publish.
- No AgentSamShell / theme / ecommerce-cms-agentsam auth wrapper edits by Agent 1.
- No silent asset transfer/rename/recompress for thumbnails.
