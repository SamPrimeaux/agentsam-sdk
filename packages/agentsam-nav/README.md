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

Menus use accessible keyboard navigation, collision handling, Escape dismissal, and restored trigger focus. Mobile navigation is a modal drawer. Hover expansion also supports focus. Persistence is deliberately external. `useNav()` exposes shell state and actions for custom controls.

## Appearance contract

`theme` is `dark`, `light`, or `system`. `accentColor` controls focus and selected control outlines. `tokens` customizes semantic roles rather than arbitrary selectors: `canvas`, `sidebar`, `surface`, `popover`, `text`, `muted`, `border`, `hover`, `selected`, `danger`, `font`, `label-size`, `meta-size`, `row-height`, `radius`, `menu-radius`, `shadow`, `width`, and `rail-width`.

Defaults: 56px topbar/rail, 264px expanded sidenav, 14px labels, 12px metadata, 36px rows, 8px controls, 14px menus. Touch controls expand to 44px. Each surface and portal carries its own theme, so a light commerce host can embed a dark AgentSam shell without changing the host document. Supply complete, contrast-checked token sets when changing colorways. Brand identity, theme, accent, and route configuration remain separate.

## Plain JavaScript hosts

`mountNav` from the `/browser` export mounts React portals into host elements while retaining one provider. Pass `sidenav` and/or `topbar` DOM elements plus provider options. The return value supplies `update(options)` and `unmount()`. The optional `browser.global.js` bundle exposes `AgentSamNav.mountNav` and includes its own React runtime for non-React hosts. Load `theme.css` once. Do not use the bundled runtime inside an existing React tree; use the normal peer-dependent React exports there.

## Boundaries

No composer, model picker, plugin registry, message renderer, upload transport, browser, terminal, editor, or execution runtime is included. Their controls can be supplied as slots. Menu actions are callbacks; the package does not pretend unavailable operations work. The legacy low-level exports remain available; their stylesheet is `/legacy.css`.

Build with `npm run build`; validate with `npm test` and `npm pack`. Distribution contains JavaScript, declarations, scoped CSS, and the browser adapter. Registry publication is a separate release action.
