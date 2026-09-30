# Local Studio desktop release graduation — 2.6.6

**Owner lane:** installed/downloadable Local Studio only
**Branch:** `feat/local-studio-desktop-release-20260929`
**Canonical UI:** `apps/local-studio`
**Native shell:** `packages/agentsam-desktop-shell`
**Do not absorb:** Agent 1's hosted Worker/CMS finishing work

## Current verified baseline

- The installed `/Applications/AgentSam Local Studio.app` is stale `2.6.5`.
- `apps/local-studio` is already `2.6.6` and builds a real bundled desktop SPA.
- `npm --prefix apps/local-studio run verify:desktop` passes.
- `cargo check --manifest-path packages/agentsam-desktop-shell/src-tauri/Cargo.toml` passes.
- The packaged `2.6.6` Tauri app launches and exposes the real Local Studio UI: navigation, Chat/Work, composer, model picker, and Send.
- The current `2.6.6` DMG exists, but the app is ad-hoc signed; Gatekeeper rejects it.
- This machine currently has no valid Apple code-signing identity and no Tauri updater private-key environment configured.
- `agentsam-desktop-updates` is deployed, but updater checks fail because production D1 lacks `desktop_shell_releases`.
- `updates.agentsam.dev` does not currently resolve.
- `apps/local-studio/agentsam.app.json` still advertises an npm install for a private package. That install contract is stale.

## Product law

Local Studio desktop is not a website wrapper and not an npm package masquerading as an app.

```text
AgentSam Local Studio.app
  -> bundled apps/local-studio SPA
  -> Tauri native commands
  -> agentsamd / SQLite / filesystem / keychain / identity adapters
```

The npm release and desktop release may share a version, but they are separate artifacts:

```text
@inneranimalmedia/agentsam-sdk  -> npm registry
AgentSam Local Studio          -> signed/notarized native artifact + updater/download service
```

## Release gate 1 — source and native parity

Required green checks:

1. `npm --prefix apps/local-studio run verify:desktop`
2. Local Studio typecheck/tests relevant to desktop and auth
3. `npm --prefix packages/identity test`
4. `cargo check` and `cargo test` for `agentsam-desktop-shell`
5. Build the shell from the current Local Studio SPA, never from a recovery/bootstrap page
6. Launch the packaged `.app` and confirm the Local Studio accessibility tree contains the real workspace
7. Exercise native startup without blocking the work surface
8. Exercise SQLite, local content/files, PTY/agentsamd, keychain/session restoration, and deep-link callback paths

No release may proceed if the UI only works in Chrome while the packaged WebView is blank.

## Release gate 2 — one version authority

Before release, these must agree:

- root SDK package version
- `apps/local-studio/package.json`
- `packages/agentsam-desktop-shell/manifests/local-studio.json`
- generated Tauri config / bundle Info.plist
- DMG filename
- updater registry row

For this graduation target, the intended version is `2.6.6`.

## Release gate 3 — updater/download backend

1. Apply `migrations/d1/0017_desktop_shell_releases.sql` to `inneranimalmedia-business`.
2. Re-test `agentsam-desktop-updates` updater lookup; missing table must be gone.
3. Keep one backend: D1 release metadata + R2 artifact bytes.
4. Decide the canonical public updater hostname and make it resolve. Do not leave Tauri configured to a dead hostname.
5. Publish immutable release artifacts under:
   `native/release/local-studio/<target>/<arch>/<version>/<filename>`.
6. Registry rows must point at the exact downloadable artifact and include a valid Tauri updater signature.

## Release gate 4 — signing and notarization

A public macOS build is not complete while `codesign` reports `Signature=adhoc` or `spctl` rejects it.

Required for release channel:

- Developer ID Application signing identity
- hardened-runtime-compatible signing through Tauri
- Apple notarization
- stapled notarization ticket where applicable
- `codesign --verify --deep --strict` passes
- `spctl -a -vv` accepts the final app copied from the DMG
- Tauri updater private key available at build time and `.sig` generated

Unsigned/ad-hoc artifacts may only be used in a clearly named test lane.

## Release gate 5 — installer and CLI contract

`agentsam app install local-studio` must stop advertising `npm install @inneranimalmedia/agentsam-local-studio`.

Target behavior:

1. resolve OS + architecture;
2. resolve the current release artifact from the desktop release service;
3. present/download the native installer for that platform;
4. keep source/npm installation separate from native application installation;
5. fail visibly when no signed release exists.

The hosted `/install/studio` route must not claim to install Local Studio while it only installs the SDK CLI.

## Release gate 6 — clean-machine acceptance

For macOS 2.6.6:

1. download the release DMG through the public release URL;
2. mount the DMG;
3. copy `AgentSam Local Studio.app` to `/Applications`;
4. launch the copied app, not the build-tree app;
5. confirm real Local Studio shell renders;
6. confirm signed-out local usage remains available;
7. test AgentSam account login/session restore through the shared IAM authority;
8. test local filesystem/content, SQLite/database UI, terminal/PTY, and agentsamd;
9. restart the app and verify state/session restoration;
10. confirm updater check works from an older known build.

## Release gate 7 — npm SDK release

Only after desktop acceptance is green:

1. reconcile root SDK version to `2.6.6`;
2. run the full npm release verification gates;
3. `npm pack` and inspect the consumer artifact;
4. publish `@inneranimalmedia/agentsam-sdk@2.6.6`;
5. verify npm `latest` points to the intended version;
6. verify CLI `agentsam app install local-studio` resolves the native app release rather than a private npm package.

## Hosted/web Agent 1 handoff boundary

Agent 1 owns the hosted `agentsam.inneranimalmedia.com` completion lane: marketing/download surface, hosted `/agentsam`, CMS, and web routing. Desktop work may consume the final public download/updater hostname but must not revert to a hosted WebView as its application runtime.

## Hard stop conditions

Do not call the desktop release complete if any of these are true:

- installed app opens blank;
- packaged app is only a website redirect;
- version sources disagree;
- updater endpoint returns 5xx;
- download URL is dead;
- updater signature is absent;
- Gatekeeper rejects the release artifact;
- CLI advertises a private/unpublished npm package as the desktop installer;
- native local features require a hosted login page just to render the app.
