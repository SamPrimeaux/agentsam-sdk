# `.agentsam/config.json` — portable project manifest

`.agentsam/config.json` is the small committed handshake that tells Agent Sam what project it is operating in and which portable defaults apply. It is **not** a runtime journal.

Current schema:

```json
{
  "schema_version": 2,
  "project": {
    "name": "agentsam-sdk"
  },
  "repository": {
    "id": "github:samprimeaux/agentsam-sdk",
    "remote": "origin"
  },
  "product": {
    "preset": null,
    "features": [],
    "capabilities": []
  },
  "defaults": {
    "mode": "agent",
    "profile": "default",
    "runtime": "local",
    "model": "auto",
    "deploy_target": null
  },
  "merkle": {
    "enabled": true,
    "semantic": true,
    "persistence": "auto"
  },
  "rules": {
    "file": ".agentsamrules"
  },
  "knowledge": {
    "config": ".agentsam/knowledge.json"
  },
  "local": {
    "database": ".agentsam/data/agentsam.sqlite",
    "schema": "db/schema.sql"
  },
  "sdk": {
    "created_with": "2.5.0"
  }
}
```

## Ownership boundaries

```text
.agentsam/config.json       committed portable project identity + defaults
.agentsamrules             committed repository instructions; bounded when loaded
.agentsam/knowledge.json    repository index / retrieval configuration
.agentsam/cli.json          local user's terminal/runtime/model preference; gitignored
D1 / runtime stores         runs, plans, tasks, executions, model history, subagents
Merkle snapshot store       filesystem evidence and snapshot lineage
Git                         source-control authority
knowledge generations       indexed evidence history; never mutable project config
```

Do **not** add account/user/tenant/workspace identity, current run IDs, active task state, PTY/session/connection IDs, current Merkle roots, provider credentials, deployment receipts, model history, or subagent execution records to the project manifest.

AutoRAG manages the existing `.agentsam/knowledge.json` authority. It may add a portable repository/project key and explicit lane/profile settings there; it does not create per-lane, retrieval, backend, or credential config files. `workspace_id` is legacy read compatibility only, not universal knowledge authority.

`repository.id` is the portable repository authority for Agent Sam surfaces. Existing `knowledge.json.repository_id` remains readable during migration, but when both files exist the IDs must agree. Git remote discovery is fallback/adoption evidence rather than a second persistent identity.

For a repository already hosted on a known Git provider, IDs use the portable form such as `github:owner/repo`. Repositories without a provider identity receive a durable `local:<uuid>` ID.

Project defaults are intentionally different from machine preferences. A project can say `defaults.model = "auto"`; a developer can independently prefer an Ollama model on one laptop in `.agentsam/cli.json` without changing the repository contract.

## Project instructions

Generated projects include `.agentsamrules` as the human-editable repository instruction surface. The manifest only points to it; the instructions themselves stay outside JSON so teams can maintain them like other repository documentation. Runtime loaders hash and bound the file before it enters context.
