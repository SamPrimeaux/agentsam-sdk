# Local Studio Desktop Experience Contract

**Status:** Product acceptance contract  
**App:** `local-studio`  
**Desktop shell:** `packages/agentsam-desktop-shell`  
**Canonical UI:** `apps/local-studio`
**Identity package:** `packages/identity`

The downloadable Local Studio app must look like Local Studio because it **is** Local Studio.

## Launch contract

Production:

```text
AgentSam Local Studio.app
        ↓
Tauri window
        ↓
bundled apps/local-studio desktop SPA
        ↓
real AgentSam shell / workspace
```

Not acceptable as a shipped default:

```text
bootstrap/status shell
→ "Open Studio UI"
→ hosted website
```

The packager must fail closed if the real desktop SPA is missing. It must never silently substitute a recovery page into a release artifact.

Native capability startup (`agentsamd`, filesystem bridges, database bridges) happens in the background and must not cover the work surface with a diagnostic boot screen.

## Packaged identity UI, shared account authority

Local Studio packages the real AgentSam login/signup/reset UI inside the application. Displaying that UI does not require redirecting to a website.

For the official connected AgentSam distribution, authentication writes to the configured identity service and main database:

```text
Local Studio / future mobile app
        ↓
bundled auth portal
        ↓
identity_bridge
        ↓
Worker identity API
        ↓
main account database
```

The Worker creates/resolves the canonical user and `auth_sessions` row. Native clients request the same session as a bearer credential rather than relying on a browser cookie. The credential is stored in the platform secure store and `/api/auth/me` validates it against the main database.

There is no desktop-only account table and no duplicate canonical user/session authority.

## Three storage authorities

```text
MAIN SERVICE / DB
  accounts, users, auth sessions, OAuth grants, provider connections,
  billing, memberships, shared/project/cloud records

LOCAL SQLITE
  installation/device metadata, workspace state, local projects, caches,
  runtime/job state, sync cursors, offline outbox, user-opened SQLite DBs

OS SECURE STORE
  account session credential, device credentials, encryption keys,
  machine-private provider secrets where policy allows
```

SQLite must not become a shadow copy of the main account database. Cached remote records are explicitly non-authoritative and disposable. Offline server-owned mutations are queued with idempotency keys and committed through the Worker.

The portable identity package may use its SQLite identity adapter only when an installation explicitly selects standalone mode.

## Platform contract

The product contract is broader than macOS:

- **macOS:** Tauri desktop, `agentsamd`, bundled JS bridge runtime, Keychain, POSIX shells.
- **Windows:** Tauri desktop, `agentsamd`, bundled JS bridge runtime, Credential Manager, `pwsh` → Windows PowerShell → `cmd.exe`.
- **Linux:** Tauri desktop, `agentsamd`, bundled JS bridge runtime, platform secret service, POSIX shells.
- **iOS:** same UI/service/storage contracts through mobile-native adapters; no executable Node/`agentsamd` sidecar assumption.
- **Android:** same UI/service/storage contracts through mobile-native adapters; no executable Node/`agentsamd` sidecar assumption.

Desktop sidecars are an implementation of local-machine capabilities, not part of the cross-platform protocol. Mobile can connect to remote/local AgentSam runtimes where appropriate while keeping account identity and device state contracts unchanged.

## Provider OAuth

Provider grants are separate from the AgentSam account session. Google, Cloudflare, GitHub, GCP, and later providers use their own consent/connection lanes. A system browser may be required for a provider's OAuth consent, but the AgentSam login UI itself remains packaged in the app.

Provider tokens never belong in callback URLs beyond the minimum standard authorization material, and confidential client secrets never belong in downloadable clients.

## Session restoration

```text
secure store has AgentSam session credential?
  no  → signed-out cloud/account state; local work remains available
  yes → /api/auth/me with Bearer credential
           valid   → canonical account restored from main DB
           invalid → clear stale credential / signed out
```

Browser cookies are not required for desktop/mobile session restoration.

## Failure behavior

If a provider, remote account service, or network connection fails, Local Studio remains usable locally.

Ordinary local workflows must never be replaced by a full-screen authentication or infrastructure error.

## Release acceptance

Before shipping a desktop artifact:

- build the Local Studio desktop SPA;
- copy the packaged auth portal into that SPA;
- verify the auth portal is AgentSam/host branded rather than donor branded;
- sync the SPA into the Tauri desktop shell;
- fail the build if the real SPA is missing or hydrate-only;
- verify the old `Open Studio UI` / `Stay on this shell` copy is absent;
- verify native startup work is non-blocking;
- run the full identity package tests;
- run Local Studio auth/type/build gates;
- run Rust checks;
- verify the packaged identity runtime/migrations are present;
- build and mount the disk image;
- launch the app copied from the disk image;
- verify local signup/login/session restoration without a hosted redirect;
- verify local files, SQLite, PTY, and `agentsamd` still work signed out.

## Product rule

> **The downloadable Local Studio app is self-contained AgentSam product software.**

Company deployments, customer hosts, and external identity providers are adapters around that product. They are not its intrinsic authority.
