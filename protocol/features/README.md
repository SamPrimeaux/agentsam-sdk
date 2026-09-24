# AgentSam Feature Capsules (`agentsam.feature.v1`)

`protocol/features/` holds only:

1. **`agentsam.feature.v1.schema.json`** — generic capsule contract (including reusable `artifacts[]`)
2. **`catalog.json`** — discovery index pointing at package-local manifests

Detailed JSON lives in each integration’s own territory, e.g.:

```
packages/identity/.agentsam/features/oauth-login-portal/
packages/providers/completeful/.agentsam/features/provider/   (target)
fuelnfreetime/features/*                                      (proving ground)
```

## Selection vs package packet vs resolved

```
.agentsam/features.json                 # user/project selections only
        ↓
protocol/features/catalog.json          # discovery
        ↓
packages/<pkg>/.agentsam/features/<id>/ # compartment packet (providers, resources, routes, ui)
        ↓
generated/.agentsam/features-resolved.json
```

Example selection:

```json
{
  "schema_version": 2,
  "features": {
    "auth": {
      "selected": true,
      "capabilities": ["identity.init"],
      "provider_template": "inneranimalmedia",
      "selected_at": "2026-09-24T04:25:12.860Z"
    }
  }
}
```

## artifacts[]

Generic reference mechanism on any feature capsule:

```json
"artifacts": [
  { "kind": "provider-catalog", "path": "./providers.json" },
  { "kind": "resources", "path": "./resources.json" },
  { "kind": "routes", "path": "./routes.json" },
  { "kind": "ui", "path": "./ui.json" }
]
```

Not identity-specific — Completeful, Resend, nav, analytics, CMS, CAD use the same pattern.
