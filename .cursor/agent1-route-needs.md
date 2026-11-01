# Agent 1 → Agent 2 coordination (Media routes)

Agent 1 shipped Media Library destinations and CF discovery. Do **not** remount MovieMode on `/media`.

## Routes Agent 2 must keep wired in nav / shell

| Destination | Component / meaning |
|---|---|
| `/media` | Media Library overview (`MediaLibraryPage`) |
| `/media/images` | Images gallery |
| `/media/videos` | Videos gallery |
| `/media/models` | Models gallery |
| `/media/files` | All-files gallery |
| `/admin/moviemode` | MovieMode Apps surface only |
| `/admin/moviemode/edit` | MovieMode editor |

## Shell / nav requirements (Agent 2 owns these files)

1. **Primary nav** — Media → `/media` with children Images/Videos/Models/Files. Do not alias MovieMode to `/media`.
2. **`AgentSamShell.tsx`** — `isMovieModeRoute` must match `/admin/moviemode` only (WIP already does this). Keep legacy `/admin/content` → Media redirects if present.
3. **Side Stage** — tab `media` may remain a MovieMode preview pane; full-screen CTA should prefer `/admin/moviemode`, not `/media`.
4. **Library / Content labels** — Content folds into Media; Library (`/artifacts`) may remain as Work alias.

## Already implemented by Agent 1 (do not re-invent)

- Route files under `apps/local-studio/frontend/src/routes/(apps)/media*.tsx`
- `MediaLibraryPage` + CF resources strip
- `GET /api/connections/cloudflare/resources` and R2 object paging
- Legacy redirects via `resolveLegacyContentMediaPath`
- MovieMode surface navigation locked to `/admin/moviemode*`
