# Agent Sam SDK — terminal experience

The Agent Sam terminal is a presentation layer over real local capabilities. It is not a second execution engine and it is not tied to Gorilla, Cloudflare, or a particular model provider.

## Default experience

```bash
agentsam tui
```

Runs the bundled zero-dependency Node/ANSI renderer. This is the default because it is available anywhere the npm CLI runs.

```bash
agentsam tui rich
agentsam tui rich --install
```

Runs the optional Python Rich renderer. `--install` creates an isolated `.agentsam/tui-venv` and installs Rich there; system Python is left alone.

```bash
agentsam shell
```

Shows the command catalog and local PTY / DB / TUI surfaces.

## Architecture

```text
CLI command / execution state
        |
        +--> Node ANSI renderer        default, zero extra dependencies
        |
        +--> Python Rich renderer      optional high-fidelity live presentation
        |
        +--> browser shell-kit         reusable React components, separate surface

Capabilities underneath presentation:

Git context
Local SQLite
Local PTY
Agent/tool execution
Logs/events
Deploy adapters
```

Presentation consumes state. It does not authorize tools, decide policy, own databases, or execute cloud operations by itself.

## Local project contract

`agentsam init` creates:

```text
.git/
.env
.env.example
agentsam.config.js
.agentsam/config.json
.agentsam/data/agentsam.sqlite
db/schema.sql
src/agent.js
src/dev-server.js
scripts/smoke.mjs
```

There is no Worker requirement in this contract.

`src/agent.js` is runtime-neutral. The Node development adapter injects local SQLite. A cloud adapter may later inject D1 or another compatible store.

## TUI ownership

| Surface | Location | Role |
|---|---|---|
| ANSI | `examples/agentsam-tui-ansi.mjs` | npm-native default terminal renderer |
| Rich | `python/agentsam_sdk/tui/` | optional richer cards, progress, events, logs |
| shell-kit | `packages/agentsam-shell-kit/` | reusable React/browser work-surface components |
| Gorilla | `templates/gorilla-shell/` | visual/theme experiment only |

Gorilla is intentionally not scaffolded by default.

## Commands

```text
/help       show commands
/status     local project / DB / Git / PTY health
/context    current repository + revision
/pwd        working directory
/cd         change directory
/git        Git operations
/db         local SQLite
/agent      invoke configured Agent Sam
/logs       local execution events
/tui        terminal presentation
/deploy     intentionally add a cloud adapter
```

Provider-specific commands such as `/claude` or `/codex` are not part of the generic shell contract. Model routing belongs behind Agent Sam.

Workspace switching is not required for local tooling. Authenticated user/session identity is the security boundary; workspace/project labels are organizational metadata.

## Cloud graduation

Cloud infrastructure is generated when requested, not during local init.

```text
local project
   |
   +--> agentsam deploy --target cloudflare
           |
           +--> src/cloudflare-worker.js
           +--> wrangler.toml
           +--> migrations/0001_agentsam_core.sql
           +--> provisioned account bindings
```

The same `src/agent.js` remains application authority.

## Design rule

A CLI operation should be understandable in plain text first, then enhanced by ANSI/Rich presentation. CI and agent capture must always have a deterministic non-interactive path (`--check`, JSON receipts where applicable).
