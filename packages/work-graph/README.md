# Work Graph

Core primitive for AgentSam workflows. Import it through the published SDK,
for example `@inneranimalmedia/agentsam-sdk/work-graph` or the matching
`/work-graph/renderers/timeline` subpath. The sibling workspace package stays
private until it has its own release process.

The same graph powers multiple adapters:

## Engineering adapter

- Git
- MCP tools
- Tests
- Deployments

## Business adapter

- Projects
- Clients
- Approvals
- Milestones

The Gantt/timeline UI is only a renderer over this graph. Each adapter accepts
an explicit array of source records and maps them to work items; it performs
no network calls or writes.

```
WorkGraph
 ├── WorkItem
 ├── Dependency
 ├── TimelineEvent
 ├── Artifact
 ├── Evidence
 └── Actor
```

## Origin

Extracted from `agentsam-lab`'s `packages/work-graph/` on 2026-09-18, where
it was built and deployed once (`prototype-gnantt.html`) but left orphaned
after `agentsam.inneranimalmedia.com`'s route was superseded by
`apps/local-studio`. The implementation was already correct — only its
location was wrong. See `docs/plans/ASTRA-BRIEF-2026-09-18.md` §4 for the
extraction rationale.

Register any new consumer against `protocol/capabilities/manifest.json`
(`workgraph.*` capability ids) rather than re-deriving a task-timeline view
from scratch.
