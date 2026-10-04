# @inneranimalmedia/agentsam-browser-surface

The browser as a portable capability, not a web-only page.

```text
AgentSamBrowserSurface
   ├── Browse mode : navigate · inspect · summarize · interact
   └── Build  mode : generate · hot-preview · inspect · annotate · edit · publish

SideStage → BrowserStage → BrowserProvider
                             ├── current lightweight browser
                             └── AgentSamBrowserShell (ABS) provider
```

```ts
const surface = new AgentSamBrowserSurface({
  providers: [createLightweightBrowserProvider(host), createAbsBrowserProvider({ host: absHost })],
  defaultProviderId: 'agentsam-browser-shell',
  onRuntimeEvent: (e) => runtime.handle(e),
});
```

The lightweight Local Studio browser stays the stable host while ABS supplies
the richer implementation — we mine ABS incrementally rather than replacing a
working browser. The ABS host is referenced structurally, so this package has
no build-order dependency on `@inneranimalmedia/agentsam-abs`.

Apache-2.0.
