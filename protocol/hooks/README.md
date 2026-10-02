# AgentSam Hooks protocol

`agentsam.hook.v1` is the language-neutral lifecycle boundary for AgentSam hosts.

- `agentsam.hook.v1.schema.json`: invocation envelope.
- `agentsam.hook.output.v1.schema.json`: handler response.
- `agentsam.hooks.config.v1.schema.json`: explicit command/HTTP wiring.
- `agentsam.hook.receipt.v1.schema.json`: value-free execution evidence.

The wire format uses snake_case and Unix epoch milliseconds. Event-specific data stays under `input`; host-owned correlation IDs stay under `invocation`. Providers, MCP transports, LSP clients, runtimes, and agent schedulers adapt into this boundary rather than adding provider fields to the lifecycle contract.

Hooks are policy and transformation ports, not identity or capability authorities. Hosts must enforce permission decisions and continue to own authorization, grants, retries, persistence, and receipts. Unknown output properties are rejected so a misspelled decision cannot silently become an allow.

Cross-language bindings live in `packages/agentsam-hooks`. Its `sync:protocol` pretest/prepack gate generates distributable schema copies from this authority; a package test verifies that those generated artifacts are byte-identical.
