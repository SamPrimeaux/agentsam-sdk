# `@inneranimalmedia/agentsam-hooks`

Portable lifecycle policy and observability for AgentSam runtimes.

AgentSam Hooks is not tied to one model vendor, CLI, machine layout, or application account. The in-process JavaScript API and the JSON wire protocol share the same `agentsam.hook.v1` envelope. A hook can therefore be implemented in JavaScript/TypeScript, Python, Go, Rust, or any process or HTTP service that reads and writes JSON.

## What ships

- ordered callback runtime with explicit fail-open, fail-closed, and propagate-error behavior;
- pre/post model and tool adapters without provider wire-format assumptions;
- command and HTTP adapters for cross-language hooks;
- portable `agentsam.hooks.json` / `.agentsam/hooks.json` config discovery;
- bounded subprocess execution (timeout, output ceiling, no shell interpolation, minimal inherited environment);
- hook receipts that record timing and field names without persisting raw prompts, credentials, tool arguments, or model results;
- MCP, LSP, sub-agent, and composite capability adapters;
- TypeScript declarations plus Python, Go, and Rust protocol bindings;
- a small `agentsam-hooks` CLI for validation, inspection, and JSON invocation.

The package does **not** make hook output authoritative over AgentSam authorization, capability discovery, manifests, or verification receipts. Hooks may narrow or request permission. The trusted host still resolves identity and grants.

## JavaScript / TypeScript

```js
import {
  AgentSamHooks,
  createHookedCapabilityAdapter,
  createHookedProviderAdapter,
} from '@inneranimalmedia/agentsam-hooks';

const hooks = new AgentSamHooks({
  hooks: {
    pre_tool_use: {
      id: 'workspace-policy',
      failure_mode: 'closed',
      handler: async ({ input }) => {
        if (input.tool_name === 'terminal.exec' && input.tool_args?.dangerous === true) {
          return {
            permission_decision: 'ask',
            permission_decision_reason: 'This command requires an explicit host approval.',
          };
        }
        return { permission_decision: 'allow' };
      },
    },
    post_tool_use: async ({ input }) => ({
      modified_result: redactForModel(input.tool_result),
    }),
  },
});

const capabilityAdapter = createHookedCapabilityAdapter(tools, {
  hookRuntime: hooks,
  requestPermission: showApprovalDialog,
  invocation: { session_id: session.id, run_id: run.id },
});
const provider = createHookedProviderAdapter(modelProvider, {
  hookRuntime: hooks,
  invocation: { session_id: session.id, run_id: run.id },
});
```

Handlers receive one canonical envelope:

```json
{
  "schema": "agentsam.hook.v1",
  "hook": "pre_tool_use",
  "timestamp": 1790899200000,
  "cwd": "/portable/project",
  "invocation": { "session_id": "session-local", "run_id": "run-local" },
  "input": {
    "tool_name": "repository.snapshot",
    "tool_args": { "include_untracked": false }
  }
}
```

Canonical wire fields use `snake_case`. JavaScript hook outputs also accept the common camel-case spellings, but command/HTTP integrations should emit the canonical form.

## Cross-language command hook

`.agentsam/hooks.json`:

```json
{
  "schema": "agentsam.hooks.config.v1",
  "adapters": {
    "project-policy": {
      "type": "command",
      "command": "python3",
      "args": ["hooks/project_policy.py"],
      "timeout_ms": 3000
    }
  },
  "hooks": {
    "pre_tool_use": [
      {
        "id": "project-policy",
        "adapter": "project-policy",
        "failure_mode": "closed"
      }
    ]
  }
}
```

The executable reads one invocation envelope from stdin and writes one hook output JSON object to stdout. Diagnostic logs belong on stderr. The last non-empty stdout line is parsed as the response.

```python
import json, sys

envelope = json.load(sys.stdin)
tool = envelope["input"]["tool_name"]
if tool == "terminal.exec":
    print(json.dumps({
        "permission_decision": "ask",
        "permission_decision_reason": "Terminal access needs approval"
    }))
else:
    print(json.dumps({"permission_decision": "allow"}))
```

The command adapter does not invoke a shell. Relative command and cwd paths are resolved from the config directory, command cwd cannot escape that directory by default, output is bounded, and only portable process variables are inherited unless `inherit_environment` is explicitly enabled. Secrets can be referenced as `env:VARIABLE_NAME` in configured headers/environment values; values are resolved at runtime and do not belong in config.

## CLI

```sh
agentsam-hooks validate .agentsam/hooks.json
agentsam-hooks list .agentsam/hooks.json
printf '%s\n' '{"tool_name":"repository.snapshot","tool_args":{}}' \
  | agentsam-hooks invoke pre_tool_use .agentsam/hooks.json
```

`invoke` is useful for conformance tests and host runtimes. It is not a permission bypass: the host must still enforce the returned decision.

## Composition semantics

Hooks run by ascending `priority`, then ID. Modifications are passed into the next hook. Additional context is appended in order. Suppression is sticky. A `deny`, `ask`, or agent-stop `block` decision ends that hook chain.

Failure modes:

| Mode | Behavior |
| --- | --- |
| `open` | Record the failure and continue. Default for observational/post hooks. |
| `closed` | Record the failure and return a deny decision. Default for pre-tool and pre-model hooks. |
| `error` | Raise `HookExecutionError` to the host. |

Tool/model wrappers support bounded retries only when an `error_occurred` hook explicitly returns `error_handling: "retry"`. The host cap defaults to three. Hooks cannot create an unbounded retry loop.

## MCP, LSP, and sub-agents

The capability adapters depend on narrow host ports rather than a particular transport package:

- `createMcpCapabilityAdapter({ servers, listTools, callTool })`
- `createLspCapabilityAdapter({ languages, request })`
- `createAgentCapabilityAdapter({ agents, runAgent, hookRuntime })`
- `createCompositeCapabilityAdapter([...adapters])`

This lets an application use stdio MCP, remote MCP, an embedded language server, or a remote agent scheduler without changing the model loop. Discovery happens before capability schemas are presented to a model; authorization and execution remain host-owned.

## Protocol and bindings

JSON Schemas are owned once by the repository authority at `protocol/hooks/` and copied into the package artifact by its `prepack` gate. Bindings are included under `bindings/go` and `bindings/rust`; the Python package exposes `agentsam_sdk.hooks`. These bindings model the same envelope/output rather than introducing language-specific lifecycle semantics.

## Security defaults

- Do not place credential values in hook input, config, receipts, or logs.
- Treat argument/result modification as trusted-code behavior.
- Use `closed` for permission and policy hooks.
- Keep post hooks fast; move analytics persistence behind a queue if needed.
- Use explicit project config. This package does not silently load another user's home-directory plugins or machine-specific setup.
