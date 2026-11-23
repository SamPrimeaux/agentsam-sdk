# AgentSam Desktop / Web Parity Acceptance

**Scope:** The portable Local Studio desktop shell and the hosted AgentSam workbench must expose the same authenticated account capabilities. Native execution and local files remain device-specific; account app state does not.

## P0 — Account Apps synchronization

1. Both surfaces authenticate against the same identity authority and resolve the canonical `accounts.id` from a verified session. The native Apps API uses its secure bearer session; frontend-supplied account IDs do not authorize inventory access.
2. Both surfaces read `GET /api/apps/launcher` and display the same account-owned installed, enabled, disabled, pinned and available apps. An unverified response is an error, **not** zero installed apps.
3. Install, enable, disable, remove, pin and last-opened activity must round-trip through the account Apps API, preserving existing installations. Do not seed demo records or maintain a desktop-only list.
4. Native service routing is an explicit allowlist: `GET /api/apps/launcher`, `POST|PATCH|DELETE /api/apps/install`, and `POST /api/apps/open`. Other paths and methods fail closed.
5. Differentiate stale desktop bridge, expired authentication, service outage and verified empty registry. A failed change must not claim success.
6. The account Apps dialog, Settings Apps page, new-tab launcher, navigation and Side Stage App library must share the same state and refresh on account changes.

## P0 — Desktop release integrity

1. The built app version, source manifest version and delivery artifact version must agree; verify the installed `/Applications/AgentSam Local Studio.app` independently from repository metadata.
2. Produce a fresh frontend bundle and native binary from a clean checkout with installed, locked dependencies. Do not reuse a stale `dist` or overwrite an existing user app until the new bundle is tested.
3. Validate the configured production service origin, signed-in identity status, Apps bridge endpoint methods, and authenticated account ID **without** emitting session tokens or secrets to logs.
4. Launch the candidate macOS `.app`, sign in to the same account as web, and compare canonical keys/statuses; install only after interactive acceptance. Keep a rollback copy of the previous `.app`.

## P1 — Shared multi-agent workspace

- Preserve independent conversation/agent sessions and independent Side Stage tabs. Switching agents must not silently close resource tabs; switching resources must not abandon the active conversation.
- Support real `.md` render/source viewing, code files, PDFs, browser pages, terminal tabs/splits, CAD Creator, MovieMode, Canvas, and files through their actual implementations. No mock editors or fake tool toggles.
- Reuse `agentsam-workbench` interaction primitives and platform shell/global session orchestration. Product apps own their editors, not the global workspace or another assistant rail.
- Preserve app tabs, selected resources, split widths, unsaved editor safeguards and independent scroll positions through normal tab switching and supported reloads.
- Align Chat/Work mode and navigation between web and desktop without collapsing multi-agent orchestration into one chat.

## Device acceptance

- Primary desktop: **2560×1440** scaled iMac viewport.
- Secondary desktop: **1920×1080** viewport.
- Mobile: **390×844** CSS pixels; use one active full-width workspace surface rather than cramped side-by-side editors.
- Side Stage width modes: **20% Peek, 30% Compact, 42% Working, 50% Expanded**; drag-to-resize, maximize and restore must work.

## Evidence checklist before calling this shipped

1. Same signed-in user on web and installed desktop: compare app keys, install/enabled states, and actions. The screenshot baseline shows eight installed on web and an unverified desktop Apps request.
2. Desktop: installed-app navigation, opens, last-opened recents, pin toggles, failure/retry feedback and deep links work against the actual account.
3. Desktop: open two conversations/agent sessions, several `.md` files and a browser tab; switch, resize, maximize, restore, and verify correct content without duplicate global shells.
4. Terminal: multiple separate local sessions and splits work; errors identify their own execution transport rather than being mistaken for account-app failures.
5. Run frontend typecheck, shared-nav tests, account Apps lifecycle tests, native allowlist test, desktop bundle/build gate and hands-on acceptance in the candidate app. The code tests alone are not release acceptance.
