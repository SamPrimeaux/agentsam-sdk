# Agent 2 → Agent 1 navigation contract

Agent 2 owns global nav, auth/routing spine, theme authority, products/docs/notifications/brand chrome.
Agent 1 owns Media gallery UI bodies and MovieMode/CoPro package internals.

## Canonical Media destinations (Agent 1 should target these)

| Route | Owner surface | Notes |
| --- | --- | --- |
| `/media` | Media Library (all) | First-party SPA; **not** MovieMode |
| `/media/images` | Images | Agent 1 gallery body when ready |
| `/media/videos` | Videos | Agent 1 gallery body when ready |
| `/media/models` | Models | Agent 1 gallery body when ready |
| `/media/files` | All files | Agent 1 gallery body when ready |

Agent 1 has landed an initial `MediaLibraryPage` (+ `media-library.css`) on these routes.
Keep MovieMode out of `/media/*`. If gallery bodies still need polish, iterate in place — do not re-alias `/media` to MovieMode.

## MovieMode (Apps only)

| Route | Notes |
| --- | --- |
| `/admin/moviemode` | Projects screen |
| `/admin/moviemode/edit` | Editor screen |
| `/media/edit` | **Redirects** to `/admin/moviemode/edit` (legacy bookmark only) |

Do **not** register `/media` as a MovieMode alias.

## Legacy redirects Agent 2 already wires

- `/admin/content` → `/media`
- `/admin/content?kind=image` → `/media/images`
- `/admin/content?kind=video` → `/media/videos`
- `/admin/content?kind=model` → `/media/models`
- `/admin/content?kind=file` → `/media/files`
- `/docs` → `/settings/docs`
- `/admin/products/help/artwork` → `/settings/docs?topic=artwork`

## Final nav hierarchy (SSOT: `admin/data/navigation.json`)

- Home
- Projects
- Media → Images, Videos, Models, All files
- Analytics
- Tickets
- Sales channels → Online Store, Products (Store Products…), Audience → Growth
- Apps → AgentSam, CAD Creator, MovieMode (`/admin/moviemode`), SamSketch, Growth
- Settings → Account, Themes, Connections/Integrations, Documentation (`/settings/docs`), …

## What Agent 1 must still deliver

1. Replace `MediaLibraryPage` / Content Studio stub with real Media gallery components for `/media/*`.
2. Keep MovieMode package routes exclusively under `/admin/moviemode*`.
3. If Agent 1 adds route files under `routes/(apps)/media*`, coordinate — Agent 2 already owns the route shells and redirects.
4. Optional: leave notes in `.cursor/agent1-route-needs.md` if destinations change.

## Auth/routing rule (do not regress)

Embedded ecommerce iframes must navigate the parent via `agentsam:navigate` (SPA). Never `parent.location.assign('/admin/content…')` — that remounted the packaged console and bounced valid sessions to `/auth/login`.
