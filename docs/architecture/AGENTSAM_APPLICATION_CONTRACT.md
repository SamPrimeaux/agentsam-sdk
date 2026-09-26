# AgentSam Application Contract

**Status:** binding for portable product apps  
**Schema:** `protocol/apps/agentsam.app.v1.schema.json`  
**CLI:** `agentsam app validate` · `agentsam app list` · `agentsam app inspect <id>`

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
| npm package | `@inneranimalmedia/agentsam-cad-creator` | Distribute/install code |
| CLI command | `agentsam-cad-creator` / `agentsam cad` | Launch surface |
| Cloudflare Worker | `agentsam-cad-creator` | Host deployment name |
| desktop bundle | `com.inneranimalmedia.agentsam.cadcreator` | OS identity |
| route | `/cad` | URL mount |
| service | `cad-render-service` | Infrastructure |
| `PRODUCT.id` | `cms` | Platform product registry |
| `MOUNT.id` | `cms-studio` | Host mount slot |

Those names **may** differ. What must not happen:

```js
const APP = "agentsam-cad-creator"; // Worker name ≠ APP identity
```

Relate namespaces explicitly:

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

Same APP installed into Fuel & Free Time, Companions CPAs, InnerAnimalMedia, or a customer localhost keeps the same `APP.id`. `.agentsam/` describes **this** installation.

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
