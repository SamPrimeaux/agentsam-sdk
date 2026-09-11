# AgentSam shared workbench boundary

The SDK has one shared AgentSam interaction layer for product applications:

```text
packages/agentsam-contracts       pure TypeScript, no React
            ↑
packages/agentsam-workbench       reusable React/browser workbench
            ↑
    ┌───────┼────────┐
    │       │        │
 Local    CAD      CMS
 Studio   Studio    Studio
```

`apps/*` are development products and remain independent workspace roots. They may consume the shared packages, but shared packages must never import an app.

## Contracts

`@inneranimalmedia/agentsam-contracts` owns messages, runs, events, tools/capabilities, artifacts/attachments, model options, explicit context, and runtime adapter interfaces. Context is supplied by the host through an explicit `AgentContextProvider`; the workbench does not scrape app state implicitly.

## Workbench

`@inneranimalmedia/agentsam-workbench` owns reusable controlled UI primitives. Product-specific state stores, route trees, auth implementations, repo/CAD/CMS schemas, and deployment wiring remain outside it.

Local Studio is the first proof consumer. CAD and CMS should consume this layer through domain adapters rather than cloning Local Studio components.

## Authentication and execution

The workbench does not own identity authority. Identity establishes an authenticated principal first; application authorization then creates any optional browser/container/terminal execution session. Cache and execution bindings are never account/session authority.
