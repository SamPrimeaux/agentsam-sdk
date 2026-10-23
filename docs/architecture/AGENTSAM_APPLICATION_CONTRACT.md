# AgentSam Application Contract

**Status:** binding for portable product apps  
**Schema:** `protocol/apps/agentsam.app.v1.schema.json`  
**CLI:** `agentsam app validate` · `agentsam app list` · `agentsam app inspect <id>`

## Runtime installation versus distribution

`agentsam app list` / `inspect` / `validate` discover and validate APP manifests in the current source checkout. The current `agentsam app install <id>` implementation **prints** the manifest's npm/curl distribution command; it does not execute an install, create account-scoped host state, update installed-app records, or activate a Local Studio route.

`included_apps` and `embed` control **build-time packaging**. Installing an APP after Local Studio is already downloaded requires an actual runtime installation record, permission/connection checks, launcher/mount resolution, and verification/receipt. That must be distinct from npm installation, native `agentsam setup` recipes, and plugin OAuth registration. A manifested product can be genuine and usable before that particular host-install bridge is finished.

## Artifact taxonomy

| Type | Meaning | Canonical manifest |
|------|---------|-------------------|
| **APP** | Something a user can install/run/use as a product | `agentsam.app.json` |
| **PACKAGE** | Reusable code/capability | `agentsam.package.json` (or package metadata) |
| **SERVICE** | Runtime infrastructure/backend | `agentsam.package.json` with `type: "service"` (or `agentsam.service.json`) |
| **HOST** | Something that mounts/composes apps | host / install state under `.agentsam/` |
| **THEME** | Appearance/content kit, not an app | theme package / theme-site scaffold |

A folder under `apps/` is **not** an APP merely because of its path. The AgentSam APP contract (`agentsam.app.json`) makes it one.

Example: `apps/agentsam-go-worker` correctly uses `agentsam.package.json` (`type: "service"`) and must **not** be forced into APP semantics because it is deployable.

Theme packages and static theme-site scaffolds likewise stay outside APP semantics.

## Target tree (conceptual)

```
apps/
  cad-creator/
  client-cms-editor/
  ecommerce-cms/
  local-studio/

packages/
  database-editor/
  settings/
  identity/
  planner/
  cms-sections/
  themes/

services/
  go-runtime/
  render-runtime/
```

## Identity namespaces (must not collapse)

| Namespace | Example | Role |
|-----------|---------|------|
| `APP.id` | `cad-creator` | Canonical product identity — immutable kebab-case |
| `HOST.id` / origin | host-install projection | Where this APP instance is served; belongs to installation state, not portable APP identity |
| npm package | `@inneranimalmedia/agentsam-cad-creator` | Distribute/install code |
| CLI command | `agentsam-cad-creator` / `agentsam cad` | Launch surface |
| Cloudflare Worker | `agentsam-cad-creator` | Host deployment name |
| desktop bundle | `com.inneranimalmedia.agentsam.cadcreator` | OS identity |
| route | `/cad` | URL mount |
| service | `cad-render-service` | Infrastructure |
| `PRODUCT.id` | `cms` | Platform product registry |
| `MOUNT.id` | `cms-studio` | Host mount slot |
| remote identity/account issuer | optional host/provider adapter configuration | External account authority for an installation — **not** intrinsic APP identity |

Portable APP law: an installable APP must not hardcode a donor/company hostname, remote issuer, tenant, confidential OAuth client, or customer deployment as a prerequisite for its local product experience. Those facts belong to `agentsam.host-install.v1` state or an explicitly installed provider/identity adapter.

Those names **may** differ. What must not happen:

```js
const APP = "agentsam-cad-creator"; // Worker name ≠ APP identity
```

```js
// Forbidden: collapsing HOST and PLATFORM into alias env vars
const origin = env.AGENTSAM_STUDIO_ORIGIN || env.AGENTSAM_LOCAL_STUDIO_ORIGIN || env.IAM_OAUTH_ISSUER;
```

Relate namespaces explicitly:

```json
{
  "schema": "agentsam.host-install.v1",
  "app_id": "local-studio",
  "config": {
    "hosts": [
      { "host_id": "studio-public", "origin": "https://studio.example.com", "role": "production" }
    ],
    "identity": { "portable_default": "local" }
  }
}
```

```json
{
  "id": "client-cms-editor",
  "product_id": "cms",
  "name": "AgentSam CMS",
  "package": "@inneranimalmedia/client-cms-editor"
}
```

```json
{
  "schema": "agentsam.host-install.v1",
  "app_id": "client-cms-editor",
  "config": {},
  "mounts": []
}
```

## Manifest authority

```
apps/<app-id>/
├── agentsam.app.json    ← ONE canonical product definition
├── package.json
├── frontend/
├── backend/
├── bin/
└── .agentsam/           ← host / install / project state (not a second product def)
    └── app.json         ← references app_id; does not redefine identity
```

| File | Role |
|------|------|
| `agentsam.app.json` | Package/product definition — sole APP identity authority |
| `.agentsam/` | Host/user/project **installation** state for this checkout or customer |

Same APP installed into Ember Supply, Companions CPAs, InnerAnimalMedia, or a customer localhost keeps the same `APP.id`. `.agentsam/` describes **this** installation.

## Physical shape

```
apps/<app-id>/
├── agentsam.app.json
├── package.json
├── frontend/     # portable presentation/UI
├── backend/      # application-owned server/runtime
├── bin/          # launch/install/dev CLI
├── scripts/
├── test/
└── README.md
```

Not every directory is required for every runtime. Directory **meaning** must not change.

## Runtime identity loading

```js
import appManifest from "../../agentsam.app.json";

export const APP = Object.freeze(appManifest);
// APP.id === "cad-creator"
```

Forbidden:

- `const APP = "..."` (string used as product identity)
- Duplicated app definitions (root manifest + `.agentsam/app.json` both defining the product)
- Treating Worker name, npm package name, or route slug as `APP.id`

## AGENTSAM APPLICATION CONTRACT (rules)

APP represents a portable user-facing AgentSam application.

Every APP MUST:

1. Own exactly one canonical `agentsam.app.json`.
2. Have one immutable kebab-case `APP.id`.
3. Load runtime APP identity from that manifest.
4. Keep package, service, Worker, host, route, and desktop identities separate from `APP.id`.
5. Use explicit `app_id` / `product_id` / `service_id` / `package_id` relationships rather than aliases.
6. Follow the standard `frontend` / `backend` / `bin` layout.
7. Declare capabilities and entrypoints in its manifest.
8. Be runnable independently.
9. Be discoverable/composable by an AgentSam host.
10. Pass `agentsam app validate`.

## Resulting composition model

```
npm / install / package
          ↓
      AgentSam APP
          ↓
 ┌────────┼─────────┐
 ▼        ▼         ▼
standalone Local   another
app        Studio  APP / host
```

Goal is **not** one identifier everywhere. Goal is **one canonical identifier per namespace**, with explicit relationships between namespaces.

## Product-family and navigation boundaries

These boundaries are binding for Local Studio, the public CAD experience, and future desktop app distribution.

### Product identities

- **Local Studio is the host shell.** It owns identity/session presentation, global navigation, app discovery, installed-app state, projects, search, settings, and the shared AgentSam assistant surface. It does not absorb every product's specialist UI.
- **CAD Creator and SamSketch are separate APPs.** Their canonical identities remain `cad-creator` and `samsketch`, each with its own `agentsam.app.json`, route, release, and user experience. CAD Creator remains the engineering-oriented CAD workspace. SamSketch remains the visual, Spline-inspired scene-authoring experience. They may share host services, project references, selection/context contracts, and AgentSam assistance; they must not redirect into one another or be presented as one interchangeable editor.
- **DreamHouse is an owner project, not an APP.** It belongs in the project registry and is opened from the CAD Creator project workflow. It must not acquire a product manifest, installed-app entry, or standalone top-level route. Owner-project loading must fail visibly if the local project authority is unavailable; it must not silently substitute a public example.
- **A product family is a catalog grouping, not a route merge.** CAD Creator and SamSketch may be discoverable together under a CAD & 3D family, while remaining separately launchable/installable APPs.
- **Do not create a separate APP identity for a capability just because it has a tool, tab, or workspace name.** A capability becomes an installable APP only when it has an owned manifest, package/release, runtime contract, and installation behavior.

### Navigation responsibilities

- Global shell navigation exposes host-level destinations and the separately installed apps.
- Each app owns its specialist toolbar, layouts, panels, tools, and contextual menus. Shared design-system components may be reused; product interaction models must not be homogenized.
- The **Apps +** affordance opens the app catalog/discovery flow. The installed-app list is derived from host installation state, not a hard-coded list pretending every catalog product is installed.
- Dropdowns organize contextual layouts and actions. They should progressively reveal tools when relevant rather than add every command as a permanent global navigation item.
- Projects are data entities, not installed apps. Project records point to the owning product/runtime and its authoritative files/revisions; the project name does not become a new route or product identity.

### Catalog, install, and native-runtime boundaries

- `agentsam_products` is the official product/catalog authority. `agentsam.app.json` defines a portable APP's identity and distribution contract. `agentsam_plugins` is for installable integrations/providers, not a duplicate APP catalog.
- The existing desktop manifest's `included_apps` is an explicit **build-time bootstrap bundle**. It is not proof of runtime installation and must not be treated as the long-term app marketplace.
- Runtime app installation requires a real flow: discover a verified release; check host/OS compatibility and permissions; download and verify the versioned artifact; record the installation; mount/launch its declared routes; and expose uninstall/update/rollback state. Until that flow exists, UI must not claim that an app was installed merely because its manifest contains an npm command.
- A web-first APP must not require a Rust rebuild just to be installed or updated. Rust commands, native sidecars, filesystem access, and other privileged host capabilities are opt-in host capabilities with explicit contracts and permissions. Only a product that genuinely requires a new native capability should trigger host-runtime work.
- The base desktop host and its included bootstrap apps are released independently from later app artifacts wherever their runtime contracts permit it. A product release must declare whether it is a web bundle, a native capability, or both.

### Required integration and release gates

1. Validate the APP manifests and official product identities; reject duplicate IDs and missing release/runtime metadata.
2. Run the changed app's tests and typecheck, the Local Studio shell/route contract tests, and relevant native/provider tests.
3. Build the actual app bundles. Launch the Local Studio preview and verify that CAD Creator and SamSketch open independently, their assistant/context bridges work, and the Apps navigation does not claim unavailable installation functionality.
4. Verify the DreamHouse owner-project path through the local project authority and project registry. Verify that public CAD preview remains isolated from owner-only project data and does not redirect users to the AgentSam dashboard to perform the advertised work.
5. Commit and push the finished integration; merge to `main` only after the gates pass. Publish/deploy the relevant web artifact and/or desktop package from the merged source, then verify the actual destination URL/build.
6. After verification, prune completed remote branches and worktrees. Do not leave a completed implementation living only in an agent branch, local tree, chat, or screenshot.
