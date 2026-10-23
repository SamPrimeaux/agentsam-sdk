# Local Studio SaaS Console ownership

The host platform and the Ecommerce CMS are separate products. The SaaS Console
uses the shared `@inneranimalmedia/agentsam-nav` component API; it must not
import or execute Ecommerce's `frontend/shell.js` to draw platform chrome.

## Single-owner map

| Responsibility | Authoritative owner |
| --- | --- |
| Navigation component behavior (rail, responsive drawer, account, flyouts) | `packages/agentsam-nav` |
| SaaS navigation data / installed-app handoff | `apps/local-studio/frontend/agentsam/AgentSamShell.tsx` |
| SaaS styling and application-specific layout | `apps/local-studio/frontend/agentsam/platform-console.css` |
| Platform dashboard composition | `apps/local-studio/frontend/src/routes/index.tsx` |
| Platform home URL `/admin/home` | `apps/local-studio/frontend/src/routes/(apps)/admin/home.tsx` |
| Routing boundary at Worker | `apps/local-studio/backend/worker/index.js` |
| Conversation Chat/Work topbar and panels | `apps/local-studio/frontend/agentsam/AgentSamPage.tsx` |
| Side Assistant | existing `SideStage` from `components/workbench/side-stage` |
| Product admin pages, products, orders, theme editing, growth, CMS | `apps/ecommerce-cms-agentsam` |

## Routing behavior

`/admin/home` goes through the Local Studio TanStack Start application,
not `servePackagedConsole`. This does not delete the original
`apps/ecommerce-cms-agentsam/frontend/static/home.html`, which remains an
Ecommerce product resource.

`/agentsam`, `/cad`, `/samsketch`, `/projects`, `/tickets`,
`/artifacts`, `/media`, and other native Studio workspaces use the same
`AgentSamShell` shell. Product admin pages under `/admin/*` (other than the
platform homepage) remain routed to the installed Ecommerce application.
Desktop links to product pages use the existing
`/apps/ecommerce-cms-agentsam?page=...` handoff.

Neither the product's `NAV` global nor its CSS is the authority for the
platform sidebar. Product navigation may be visually compatible, but it must
not cause a second shell to mount around the Studio React routes.

## UI interaction boundaries

- One platform navigation rail on desktop; one accessible drawer on mobile.
- Chat/Work switcher only appears on the conversation interface.
- Console search opens the existing Command Palette.
- AgentSam Side Assistant is global on non-conversation pages; its existing
  in-conversation instance is not mounted at the same time.
- The app owns only its content workspace, inspectors and editor tools.
- Keep product data, OAuth sessions, CMS revisions and customer deployments
  under their existing authorities.

## Review/release gates

1. Resolve exact published package versions for reproducible Studio `npm ci`.
2. Generate TanStack file routes for both hosted and desktop builds.
3. Verify `/admin/home` is served through TanStack, with no store-specific copy.
4. Verify `/agentsam` and `/cad` contain exactly one global rail and no
   second `Navigation` sidebar at desktop and mobile sizes.
5. Verify direct product URLs still load original functional application pages.
6. Check Side Assistant dock, collapse, resize, focus and persistence.
7. Inspect rendered hosted/desktop screens before merge or Worker deployment.

Do not deploy Fuel & Free Time as part of the platform shell release.
