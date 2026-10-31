# @inneranimalmedia/agentsam-nav

One navigation context, two independently mountable surfaces. The package owns navigation presentation and transient interaction state. The host owns routing, accounts, projects, conversations, persistence, and all network access.

```tsx
import { Nav } from '@inneranimalmedia/agentsam-nav';
import '@inneranimalmedia/agentsam-nav/theme.css';

<Nav.Provider value={navigation} theme="dark" accentColor="#8B5CF6" peekable defaultOpen={false}>
  <Nav.Sidenav />
  <main>
    <Nav.Topbar rightSlot={<YourWorkspaceControls />} />
    {children}
  </main>
</Nav.Provider>
```

Either surface can be omitted. `Nav.Topbar` accepts `children` to replace its composition, or `contextSlot`, `modeSlot`, and `rightSlot`. Named parts include `TopbarLogo`, `ProjectContext`, `TopbarSpacer`, `FilesResources`, `ConversationActions`, `ShareButton`, `AccountSwitcher`, `OverflowMenu`, and `ModeSwitcher`. `Nav.Scope` applies the same appearance to a consumer's layout.

## Configuration

`value` supplies `brand`, `mode`, `project`, `conversation`, `projects`, `conversations`, `account`, `accounts`, `destinations`, menu action arrays, and callbacks. Every identity has a stable `id`. Routing uses consumer callbacks and has no router dependency. `brand` contains `name`, `logo`, and `home`. Destinations accept an icon node, label, and either `href` or `onSelect`.

Menus use accessible keyboard navigation, collision handling, Escape dismissal, and restored trigger focus. Mobile navigation is a modal drawer. Hover expansion also supports focus. Business-data persistence is external; optional `storageKey` persists shell preferences only. `useNav()` exposes shell state and actions for custom controls.

## Appearance contract

`theme` is `dark`, `light`, or `system`. `accentColor` controls focus and selected control outlines. `tokens` customizes semantic roles rather than arbitrary selectors: `canvas`, `sidebar`, `surface`, `popover`, `text`, `muted`, `border`, `hover`, `selected`, `danger`, `font`, `label-size`, `meta-size`, `row-height`, `radius`, `menu-radius`, `shadow`, `width`, and `rail-width`.

Defaults: 56px topbar/rail, 264px expanded sidenav, 14px labels, 12px metadata, 36px rows, 8px controls, 14px menus. Touch controls expand to 44px. Each surface and portal carries its own theme, so a light commerce host can embed a dark AgentSam shell without changing the host document. Supply complete, contrast-checked token sets when changing colorways. Brand identity, theme, accent, and route configuration remain separate.

## Plain JavaScript hosts

`mountNav` from the `/browser` export mounts React portals into host elements while retaining one provider. Pass `sidenav` and/or `topbar` DOM elements plus provider options. The return value supplies `update(options)` and `unmount()`. The optional `browser.global.js` bundle exposes `AgentSamNav.mountNav` and includes its own React runtime for non-React hosts. Load `theme.css` once. Do not use the bundled runtime inside an existing React tree; use the normal peer-dependent React exports there.

## Boundaries

No composer, model picker, plugin registry, message renderer, upload transport, browser, terminal, editor, or execution runtime is included. Their controls can be supplied as slots. Menu actions are callbacks; the package does not pretend unavailable operations work. The legacy low-level exports remain available; their stylesheet is `/legacy.css`.

Build with `npm run build`; validate with `npm test` and `npm pack`. Distribution contains JavaScript, declarations, scoped CSS, and the browser adapter. Registry publication is a separate release action.

## Router and shell preferences

Pass the router's `value.pathname` for segment-aware selection of the deepest matching destination. Ancestors expand inline and `NavProjectContext` renders route breadcrumbs when there is no active project/conversation; `NavBreadcrumbs` is also available separately. Set `exact: true` on a destination to avoid matching descendants. Arbitrarily nested destination children use the same keyboard-accessible rows.

`storageKey` is an optional installation/account-scoped provider option for sidebar width, collapsed state and expanded navigation groups. Omit it for memory-only state; private browsing or invalid stored values cannot prevent navigation. `resizable` enables pointer resizing, Arrow keys, Home/End bounds and double-click reset. Set `value.showHistory: false` in non-conversation hosts.

The browser controller also exposes `toggle()`, `setOpen(boolean)` and optional `onStateChange({ open, isMobile, width })` for host header controls. `navIcon(name)` creates a safe React icon from common semantic names without injecting HTML.

For mixed React and plain-JavaScript hosts, share one `createNavState()` store through `stateStore`. `mountNav()` returns its `stateStore`; pass that exact object to the React `Nav.Provider`. The object is framework-neutral and works across separately bundled React roots. Give only the owning host a `storageKey`; subscribers do not create additional preference writers. Stores are per installation, never module singletons, and contain no identity or network state.

`value.newConversationAfter` inserts the optional built-in New chat action after a destination id (for example `home`). Without it the legacy order is retained.

A destination with both `href` and `children` renders a direct navigation link plus a separate disclosure button; activating its label does not merely expand it. Set `value.showSidebarHeader: false` when the host header already owns the global hamburger. Mobile drawers then offer a Close navigation control and keep Escape/outside dismissal.

### Workspace navigation behavior

Desktop navigation toggles explicitly between a compact icon rail and an expanded sidebar. Collapsed destinations have delayed, portalled hover/focus labels. Mobile uses the same component in an accessible overlay drawer; constrained tablets start compact when there is no saved preference. Hosts that already own the hamburger set `showSidebarHeader: false` and control the provider through the browser adapter or `Nav.Trigger`.

Projects, Pinned and Recent are consumer-supplied records. Supply `updatedAt` from real activity, persisted `pinned` values, and callbacks backed by the existing host authority. Collections support search, disclosure preferences and bounded Show more presentation. `historyStatus` and `onRetryHistory` distinguish unavailable project services from an empty registry. The navigation package never stores projects, conversations or pin records itself.
