# AgentSam Feature Capsules (`agentsam.feature.v1`)

A **feature** is a vertical slice of useful product behavior that a host **APP** can activate.

| Unit | Manifest | Meaning |
|---|---|---|
| **APP** | `.agentsam/app.json` (and/or `agentsam.app.json`) | Runnable + mountable composition |
| **FEATURE** | `agentsam.feature.json` | Capability capsule (UI/routes/tools/hooks/migrations/providers) |
| **PACKAGE** | `agentsam.package.json` / `package.json` | npm artifact for the implementation |

**Law:** `npm install` is inert. AgentSam validates → plans → operator approval → activates → receipt.

## Proving ground

Fuel & Free Time currently hosts incubating implementations. Feature manifests under `fuelnfreetime/features/*` point at those paths until extraction into `agentsam-sdk/packages/*`.

## Catalog

See `catalog.json` and `examples/`.
