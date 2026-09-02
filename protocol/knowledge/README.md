# AgentSam Knowledge Protocol

Provider-neutral JSON Schema contracts shared by the JavaScript SDK, Python SDK, Inner Animal Media runtime, and MCP surface. Runtime-specific bindings and credentials do not belong in these schemas.

`index-config.schema.json` describes the runnable local/backend indexing configuration. The other eight schemas are recovered remote-transport contracts; see `docs/knowledge-branch-recovery.md` for provenance. Repository descriptors in those remote contracts require a hosted repository name; local engine configuration instead supports repositories without a Git remote through an explicit persistent repository ID.
