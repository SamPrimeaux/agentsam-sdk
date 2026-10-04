# ADDENDUM — Local Studio is a real application (2026-09-27)

**Status:** Non-negotiable product/engineering contract. Supersedes any scaffold, demo, remote-redirect, or “UI-first” shortcut that conflicts.  
**Applies to:** `apps/local-studio`, `packages/agentsam-desktop-shell`, `packages/agentsam-*` Studio UI packages, `agentsamd`.  
**Related:** [`LOCAL-STUDIO-GRADUATION-2026-09-26.md`](./LOCAL-STUDIO-GRADUATION-2026-09-26.md) · Fuel/web zero-local handoff remains a separate track.

**Governing principle (verbatim):**

> Build correctly from the start. Half-measures cost double.  
> Do not optimize for appearing finished. Optimize for each completed slice being production architecture that we can keep.

---

## Part A — Architecture correction (Tauri is real; the product UI must be bundled)

### What is actually wrong

The `.app`, Rust process, WebView, keychain, sidecars, and Tauri IPC are **real**. That is not the disputed part.

The bug is: **we built native capabilities, then stopped rendering a desktop client that consumes them.**

```text
CURRENT (wrong product shape)

AgentSam Local Studio.app
├── Tauri / Rust                 ✅ real native application
│   ├── keychain / updater / OS
│   ├── agentsamd supervision
│   └── Tauri IPC commands
├── bundled desktop-boot.html    ✅ local launcher only
└── "Open Studio UI"
        └── navigates WebView to
            https://agentsam.inneranimalmedia.com/agentsam
                └── hosted web application
                    ❌ not the bundled desktop UI
```

Effective architecture today:

`native runtime → tiny local bootstrap → hosted Studio`

Required architecture:

```text
TARGET

AgentSam Local Studio.app
├── Tauri / Rust
│   └── native desktop integration (keychain, windows, updater, OAuth handoff, dialogs)
├── bundled Studio React client
│   ├── /agentsam
│   ├── /database
│   ├── /terminal
│   ├── /files / Library
│   ├── /sites (CMS)
│   ├── /cad
│   ├── /projects
│   └── /settings
└── agentsamd
    ├── SQLite
    ├── PTY / terminal
    ├── filesystem / workspace
    ├── Git
    ├── MCP / tools
    ├── local models / jobs
    └── machine runtime APIs
```

Cloud services are **dependencies of the installed application**, not replacements for it.

```text
                Local Studio UI (bundled)
                         │
              ┌──────────┼───────────┐
              ▼          ▼           ▼
          agentsamd    Tauri      cloud APIs
           local        IPC       optional
```

### IPC nuance (do not overstate)

Saying “`invoke` dies because the page became remote” is slightly too absolute.

- Product truth: after navigating to the hosted Studio, the **primary UI is no longer the bundled desktop client**.
- Technical nuance: Tauri **can** grant capabilities to remote origins so a hosted page could call `local_sqlite_bridge`, etc.
- **We refuse that architecture.** Granting a remotely deployed webpage privileged access to SQLite, PTY, filesystem, and agentsamd is the wrong trust boundary for Local Studio.

### Nitro SSR ≠ justification for redirect

Server-rendered Studio works like: request → Nitro HTML → hydrateRoot(document).

Tauri `frontendDist` is static files — there is no Nitro server behind it. Copying hydrate-only client chunks into the `.app` produces a blank window. That is a **build-target problem**, not a reason to make Local Studio remote.

**Do not** solve this by bundling Node + Nitro SSR into the `.app` solely to reuse the web entry. Prefer:

```text
// web entry
hydrateRoot(document, <Studio runtime={cloudRuntime} />);

// desktop entry
createRoot(document.getElementById("root")!).render(
  <Studio runtime={desktopRuntime} />
);
```

### Shared UI, not two products

Do **not** create duplicated `local-studio-cloud` / `local-studio-desktop` apps that fork screens.

```text
packages/
  studio-ui/          (or existing feature packages)
  studio-runtime/     contracts + RuntimeHost

apps/
  local-studio/
    desktop-entry → DesktopRuntimeHost → Tauri + agentsamd
  studio-web/ (or current Nitro app)
    server-entry → CloudRuntimeHost → authenticated APIs
```

Screens call:

```ts
const runtime = useRuntime();
await runtime.database.query(...);
await runtime.terminal.create(...);
await runtime.files.read(...);
await runtime.content.importAsset(...);
```

Not scattered `invoke("local_sqlite_bridge")` inside random React components.

### Preferred desktop runtime split

| Layer | Owns |
| --- | --- |
| **Tauri** | Windowing, keychain, updater, OAuth handoff, native dialogs, app lifecycle, OS integration |
| **agentsamd** | Terminal/PTY, filesystem/workspaces, Git, SQLite, MCP/tools, jobs, local models — reusable outside Tauri |
| **Cloud APIs** | Optional authenticated services when the feature truly needs them |

Later the same UI can target: `local agentsamd | remote agentsamd | cloud runtime` via one protocol.

---

## Part B — Real application contract (mockups are specs, not permission to fake)

This overrides any earlier scaffold / demo / placeholder / remote-redirect interpretation.

**A screen is not implemented because its layout exists.**  
A feature is implemented only when its intended user workflow works end-to-end against the real runtime.

### Non-negotiable rules

1. **Every mocked primary surface must become functional** — or be withheld from production navigation. No clickable UI that leads to empty canvases, fake datasets, placeholder editors, dead controls, decorative metrics, or simulated success.

2. **The installed application owns a real bundled application UI.** No main product action may escape via `location.href = https://agentsam.inneranimalmedia.com/...` (or equivalent) merely to obtain the real UI.

3. **Mockups define intended capability, not merely styling.** Database → real workbench. CAD → real workspace/runtime. Sites → real site data/ops. Projects → real workspaces. Settings “Runtime: Local Studio - Mac” → detected state.

4. **No mock data may silently survive into production paths.** Seed/demo only inside explicitly identified fixtures.

5. **Every control terminates in a real contract:**

```text
UI → domain/runtime contract → real implementation
  (agentsamd | Tauri | SQLite | FS | Git | PTY | MCP | cloud API | remote runtime)
```

6. **Tauri and agentsamd have separate responsibilities** (see Part A). Do not scatter machine logic across React because `invoke()` is convenient.

7. **Desktop UI and web UI may share implementation; desktop is not a redirected web session.** Solve Nitro/SSR via a desktop entry/build target.

8. **Routes are capabilities, not milestones.** `/database` existing ≠ done.

9. **Blank or skeletal surfaces fail acceptance.** Keep unfinished routes development-only / out of release nav.

10. **Database means an actual database workbench** — provider-aware, schema/table/query/CRUD, real errors, persisted connection context. Not mocked JSON.

11. **Terminal means an actual terminal** — real PTY/session, stdout/stderr/input, lifecycle/reconnect. Not canned echoes or a remote page.

12. **Sites/CMS means actual content ownership and publishing** — reusable across customers; not hard-coded to AgentSam SDK, Fuel, or one brand.

13. **Account/Settings read and mutate actual state** — appearance, runtime identity, project context, health checks, update channel.

14. **Offline/local-first claims must be testable.** Shell + local files + local DB + supported agentsamd ops must work without needing `agentsam.inneranimalmedia.com` to *render* the primary UI. Cloud-required features may report offline.

15. **Do not implement temporary architecture we already know must be removed.** Partial scope OK. Fake completion not OK.

16. **“Done” requires evidence** — boot from installed `.app`; no product-critical redirect; real runtime detected; core CRUD/workflow; persist across relaunch; failure + offline tested where relevant; no mock source in production; screenshot/video or automated receipt.

### Definition of Done

```text
mock exists          ≠ implemented
route exists         ≠ implemented
component renders    ≠ implemented
API stub exists      ≠ implemented
fake data looks OK   ≠ implemented

real user action
  → real runtime/provider
  → real state change/result
  → persisted/recoverable state
  = implemented
```

Visual parity and functional parity are **both** required. Incremental shipping is OK (Database before CAD); calling empty shells “done” is not.

### Navigation status (required)

Every primary nav item must be explicitly one of:

| Status | Meaning |
| --- | --- |
| **REAL** | Acceptance matrix passed |
| **IN DEVELOPMENT** | Wired but incomplete; may show in dev builds |
| **NOT SHIPPED** | Hidden from production nav |

There is no fourth category: “looks finished but doesn’t do anything.”

Surfaces currently represented (must eventually be REAL or withheld): AgentSam/chat, Library, Sites/CMS, CAD, Database, Projects, Settings (Account, Agents, Customize, Brand & Design, Git & PRs, Codebase, Browser & Network, Themes, Storage, Keys & Secrets, Plan & Usage, Notifications, Docs), terminal/runtime controls.

Themes cards (AgentSam Graphite, Ember Supply, Shinshu, …) must become discovered/installed theme projections — not permanent hard-coded gallery fakes. Healthy badges and Local account must derive from real checks/identity.

### Library vs Sites → Media

| Surface | Meaning |
| --- | --- |
| **Library** | Global/user/project resources (files, docs, imports, conversation resources, reusable assets) |
| **Sites → Media** | Assets belonging to a site’s content model (images, video, logos, product/theme media, variants) |

Share storage/runtime primitives underneath. Do **not** build two unrelated media-management systems. Theme editors pick from Media Library — they do not invent a second upload store. Do **not** put the media uploader under `/settings/themes`.

---

## Part C — Content Studio / Media slice (post `0ac693c` / `49fdf16`)

### What landed (foundation — not finished UX)

On `agentsam-sdk` `main` through `49fdf16`:

- `packages/agentsam-content-studio` — `MediaDropzone.tsx`, wiring in `ContentLibrary` / `ContentStudio`
- `apps/local-studio/frontend` — `ContentStudioPage` upload→optimize path, `agentsam-sdk-brand` dependency, ambient types unblocker
- `apps/local-studio/frontend/src/routes/api/content.optimize.ts` — **web/Nitro host** optimize route (sharp server-side)
- Removed `examples/local-studio-demo` + workspace entry

Verified claim from that pass: package typechecks; processors (sharp/etc.) correctly stay server/runtime-side, not in the browser component.

### Not complete until product UX + desktop runtime

A package component + API route + green typecheck ≠ finished feature.

#### 1. Canonical Local Studio destination

```text
Local Studio → Sites → selected site/project → Media / Content Library → real ContentStudio
```

Existing Sites hierarchy (Content / Media / Structure / Settings) is correct. **“Open media library” must open the real ContentStudio / ContentLibrary** (with MediaDropzone), not a stub and not Themes.

#### 2. Required media UX states

Visible lifecycle for uploads: `uploading | registered | processing | ready | failed`.

For images, user can see **Original** and **optimized variant**, plus real metadata when available (filename, type, dimensions, sizes, variants, created time, storage/provider, processing state). Do not optimize invisibly.

#### 3. `/api/content/optimize` is web-host only — not universal

```text
WRONG as universal architecture:
ContentStudioPage → POST /api/content/optimize → Nitro → sharp
  (especially if that silently means agentsam.inneranimalmedia.com)

RIGHT:
ContentStudio UI → ContentRuntime → host-specific implementation
```

```text
                     ContentStudio UI
                           │
                    ContentRuntime
                           │
            ┌──────────────┼───────────────┐
            ▼              ▼               ▼
     DesktopRuntime     WebRuntime     CustomerRuntime
            │              │               │
        agentsamd       /api route      host adapter
        local fs         sharp/etc.     configured
```

Desktop must **not** require the hosted Studio for local import/optimize. Do not bundle Nitro solely to keep this helper. Contract is SSOT; sharp is one web implementation.

#### 4. Orchestration belongs in the runtime, not the page

Prefer:

```ts
runtime.content.importAsset(...)
// events: asset.created | processing | variant.created | ready | failed
```

over page-owned:

```text
createAsset(rawBytes) → POST optimize → addVariant()
```

Otherwise every host (Local Studio, Fuel, IAM CMS, customer N) duplicates the pipeline and kills portability.

#### 5. Persisted means persisted

Reactive event bus = live UX notification, **not** SSOT.

Acceptance: upload → appears → quit app → relaunch → asset + variants still present. Metadata store + byte store as configured by runtime (e.g. SQLite + local content storage).

#### 6. `agentsam-sdk-brand` typing

Ambient `agentsam-sdk-brand.d.ts` in the consumer is an **unblocker only**. Canonical types must eventually ship from the package (or shared contracts). Record the gap; do not treat per-consumer `.d.ts` as permanent ownership.

#### 7. TanStack `routeTree.gen.ts`

Do **not** hand-patch the generated file. Do **regenerate** via normal `npm run dev` / build before calling the route “done.” “It fixes itself someday” is not acceptance.

#### 8. FnF migration

Keep Ember Supply migration **separate** until Local Studio acceptance for this slice passes. Then migrate FnF onto the same Content Studio package/runtime — do not recreate.

### Minimum acceptance test (this media feature)

1. Launch **AgentSam Local Studio.app**
2. Sites → choose site → Media
3. Drop a real PNG/JPEG
4. UI shows the real asset immediately
5. Original bytes persisted
6. Processing runs (local for desktop; web route only for web host)
7. Optimized variant generated
8. UI shows completion + variant info
9. Quit completely
10. Relaunch → same site Media → original + variant still present
11. Disconnect internet → local asset workflow still works (desktop)
12. Force optimization failure → real failure UI
13. No request to `agentsam.inneranimalmedia.com` required for the local operation
14. Clean checkout: generate routes, typecheck, build pass

---

## Part D — Cursor / next-agent implementation order

Treat current Content Studio work as **runtime/component foundation**, not completed UX.

1. Wire real ContentStudio into **Sites → selected site → Media / Open media library**.
2. Visible processing / variant / error state in that surface.
3. Move upload/optimization orchestration behind reusable **ContentRuntime** (`importAsset` + events).
4. Keep `/api/content/optimize` as **WebRuntime** only.
5. Provide **DesktopRuntime** implementation (agentsamd / local) without hosted site.
6. Verify durable persistence across relaunch.
7. Regenerate TanStack route tree; run real build/typecheck.
8. Remaster `packages/agentsam-desktop-shell/scripts/desktop-boot.html` as a real machine home UI — and stop making “Open Studio UI” (remote) the primary product path; desktop entry + bundled client is the path.
9. Keep FnF migration after Local Studio acceptance.
10. Do not add more UI placeholders while these core paths remain disconnected.

### Explicit anti-pattern for this slice

Wiring desktop UI **directly** to `/api/content/optimize` (or the hosted origin) recreates the Tauri failure mode: beautiful local chrome whose important work secretly depends on the hosted web runtime.

**Right outcome:**

```text
same Content Studio UI
same Content runtime contract

desktop → local execution
web     → server execution
FnF     → configured host execution
```

---

## Part E — Evidence / open items at authoring time

| Item | State |
| --- | --- |
| MediaDropzone + content.optimize (web) | Landed on `main` (`0ac693c`…`49fdf16`) — foundation |
| Sites → Media mounts real ContentStudio | **Open** — instruct next Cursor pass |
| DesktopRuntime optimize (no Nitro) | **Open** |
| Desktop SPA / createRoot entry (no remote redirect) | **Open** — build-target + graduation plan |
| routeTree.gen.ts regenerated in CI/dev | **Open** until proven |
| agentsam-brand package `.d.ts` | **Gap** — ambient consumer unblocker only |
| Boot shell remaster | **Open** — source: `packages/agentsam-desktop-shell/scripts/desktop-boot.html` |

---

*End of addendum. If this file conflicts with scaffold notes or “open cloud Studio until SPA ships” copy in boot UI / sync scripts, this file wins.*
