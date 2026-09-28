# Local Studio Desktop Experience Contract

**Status:** Product acceptance contract  
**App:** `local-studio`  
**Desktop shell:** `packages/agentsam-desktop-shell`  
**Canonical UI:** `apps/local-studio`

The downloadable Local Studio app must look like Local Studio because it **is** Local Studio.

## Launch contract

Production:

```text
AgentSam Local Studio.app
        ↓
Tauri window
        ↓
bundled apps/local-studio desktop build
        ↓
real AgentSam shell / workspace
```

Not a production default:

```text
AgentSam Local Studio.app
        ↓
thin bootstrap/status page
        ↓
"Open Studio UI"
        ↓
hosted site
```

A bootstrap/status page may exist for development or recovery. It is not the normal shipped entrypoint.

## Bundle ownership

`packages/agentsam-desktop-shell` owns native-shell responsibilities: Tauri, deep links, Keychain, updater, filesystem/process bridges, and sidecars.

The visible product is `apps/local-studio`.

The build should fail rather than silently ship an old placeholder when the real Local Studio desktop distribution is missing.

## First useful frame

The app should immediately present real Local Studio product chrome: project/recent-work continuity, the active work surface, optional contextual panes, and real editor/browser/files/database/terminal surfaces.

Infrastructure status must not replace the work surface.

## Authentication UX

Authentication is an action **inside** Local Studio, not the app's boot screen. Unsigned-in users can continue local work.

The branded identity surface may offer Google, Cloudflare, and InnerAnimalMedia/IAM. OAuth protocol jargon belongs in diagnostics, not the primary sign-in interface.

### Google

Public desktop OAuth client → PKCE → system browser → loopback callback → renewable credential in Keychain.

### Cloudflare

Provider authorization may use the browser, but a hosted browser session is not desktop authentication.

Worker authorization → short-lived single-use PKCE-bound desktop handoff → Tauri exchange → AgentSam desktop session in Keychain.

Provider grants may remain server-side in the existing vault model.

### IAM / InnerAnimalMedia

The IAM confidential client secret remains server-side. Tauri never embeds `IAM_CLIENT_SECRET`.

Worker IAM authorization → short-lived single-use PKCE-bound desktop handoff → Tauri exchange → renewable AgentSam desktop session in Keychain.

## Desktop handoff security

Handoff material must be cryptographically random, hashed at rest, short-lived, single-use, atomically redeemed, client/state/PKCE-bound, exchanged over HTTPS, and invalid after redemption, expiry, or cancellation.

Provider tokens and refresh credentials never belong in the deep-link URL.

## Session restoration

Desktop account state restores from Keychain, not browser cookies.

```text
Keychain access token valid?
  yes → authenticated

no / expired
  ↓
renewable refresh credential available?
  yes → refresh/rotate through Worker → update Keychain
  no  → signed out
```

Browser cookies may support browser UX but are not desktop session authority.

## Decisive acceptance test

For every desktop auth lane claiming persistence:

1. Launch Local Studio.
2. Authenticate in the system browser.
3. Return to Local Studio.
4. Confirm desktop authenticated state.
5. Close the browser.
6. Quit Local Studio.
7. Clear hosted Studio browser cookies.
8. Reopen Local Studio.
9. Confirm account/provider state restores from Keychain or renewable desktop refresh state.
10. Confirm no browser re-login is required merely because cookies were removed.
11. Confirm local files, SQLite, PTY, agentsamd, and local projects still work when signed out.
12. Confirm no confidential OAuth client secret exists in the packaged app.

A flow is not complete merely because the hosted browser became signed in.

## Failure behavior

If account refresh fails, Local Studio degrades to signed-out cloud/account state while preserving local work.

Ordinary local workflows must not be replaced by a full-screen auth blocker.

## Release acceptance

Before shipping:

- build the Local Studio desktop frontend;
- sync it into the desktop shell distribution;
- verify Tauri loads bundled `index.html`;
- verify placeholder boot copy is absent from the shipped distribution;
- build the Tauri bundle;
- run identity/desktop handoff tests;
- run TypeScript and Rust checks;
- verify deep-link registration;
- verify Worker desktop exchange/session/refresh routes;
- apply required D1 migration(s);
- deploy the matching Worker version;
- perform the restart/cookie acceptance test on an installed build.

Code, Worker, migration, and installed app are one release unit for desktop authentication.

## Product rule

Tauri is the native relationship to the operating system. It is not a substitute UI.

OAuth may use the system browser, but identity belongs to the desktop only after the desktop securely persists its own renewable session.
