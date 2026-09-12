# Agent Sam SDK — terminal experience

`agentsam` is the product entrypoint. Users do not choose a renderer or need to know whether a screen is implemented with ANSI, Clack, or another terminal library.

## Product entrypoint

```bash
agentsam
```

On first use in a project, Agent Sam asks whether the directory is trusted before project-local instructions, hooks, or execution policy can load. The setup flow then uses keyboard-driven selectors for runtime and model policy.

Model policy is explicit and is governed by the normative model-selection SSOT contract in `protocol/models/README.md`:

1. **Provider** — the explicit provider lane selected by the user.
2. **Model** — the exact provider-verified model; provider-level pseudo-models such as `automatic` or `default` are not substitutes for exact selection.
3. **Reasoning level** — one of the reasoning efforts declared by that model.
4. **Processing** — Standard, Fast, Flex, or another tier only when that model declares it.

`/models`, `agentsam models`, exact `-m <model_id>` selection, runtime execution, and usage receipts must all resolve through that same inventory/selection authority. AgentSam may curate and rank a useful first page, but provider availability, capabilities, limits, and pricing retain provider-authoritative provenance.

For models with materially different pricing by reasoning, service tier, or context size, these controls are user-visible policy. They are not hidden prompt hints.

After setup, bare text is an Agent Sam request. Slash commands control the runtime.

```text
sam ~/project > Find why OAuth callback state is failing

  Model request
  model       openai:gpt-6-astra
  reasoning   high
  processing  default
  context     ~18,240 input tokens
  max call    $... conservative ceiling

  Send this request?  Yes / No
```

The model preflight is shown before the first paid request in a session, and again if a later request raises the previously approved conservative cost ceiling. Current active context remains distinct from cumulative session usage.

## Command picker

Typing `/` opens the scrollable command picker in an interactive terminal. The picker is generated from the implemented command catalog; commands should not be advertised before a handler exists.

Current controls include:

```text
/model       exact model + reasoning + processing selectors
/reasoning   change the selected model's reasoning effort
/fast        request the model's Fast processing tier
/flex        request Flex processing when supported
/standard    return to Standard processing
/context     context economics and current active-context information
/models      safe credential/provider/model inventory
/whoami      authenticated IAM identity + safe credential status
/session     current cumulative token/cost/resume receipt
/cf          bounded Cloudflare/Workers operations
/status      local project / DB / Git / PTY health
/settings    project/runtime/terminal/model preferences
/pwd         working directory
/cd          change working directory
/git         Git operations
/diff        Git diff
/db          local SQLite
/agent       local Agent Sam dev-server request
/logs        local execution events
/deploy      intentional deployment flow
/clear       clear the terminal
/help        show commands
/exit        save/pause the session and return to the host terminal
```

Provider-brand commands such as `/claude` or `/codex` are not the generic shell contract. Model execution stays behind Agent Sam.

## Credentials and identity

A user should not need to manually `source` and `unset` provider keys for every Agent Sam command.

Agent Sam resolves credentials in this order:

1. an explicitly supplied credential where a command contract permits one;
2. the current process environment;
3. the user's secure Agent Sam provider files under `~/.agentsam/env.d/`.

Provider files are machine-local and must not be group/world-readable on POSIX systems. Agent Sam parses the expected variable from the file rather than evaluating the file as shell code.

`agentsam models` uses the credential internally for safe provider discovery but never returns the secret. Its public status reports only safe facts such as provider, configured state, source class, and provider-verified model availability.

IAM login is also machine-local rather than repository state. A successful browser authentication may persist the `sdk_` bearer under `~/.agentsam/auth/session.json` with restrictive permissions. `agentsam whoami`, deploy, tunnel, and context detection can reuse that validated session. Project `.agentsam/config.json` remains portable and must not become a second identity database.

```bash
agentsam whoami
agentsam whoami --json
```

`whoami` can show safe identity/account information and whether provider credentials are available. It never prints API-key or SDK-bearer values.

## Execution approval

Model reasoning does not itself authorize host execution.

Read-only/no-side-effect capabilities may execute under the current trusted runtime policy. A model-selected capability with declared side effects must pass a runtime-owned approval boundary before its handler is invoked.

```text
Agent Sam needs execution permission

  action  cloudflare.wrangler.native:whoami
  target  local runtime · ~/project
  effect  local_process
  input   {"command":"whoami"}

  secrets remain runtime-owned and are not included in the model-visible result.

? Allow cloudflare.wrangler.native:whoami?
  Allow once
  Always allow cloudflare.wrangler.native:whoami in this project
  Deny
```

Persistent approvals are exact-operation and exact-project grants. Approving `wrangler whoami` does not authorize another Wrangler operation or another repository.

Commands whose purpose is to disclose a credential, such as `wrangler auth token`, are not model-visible capabilities. Safe identity/authorization probes are preferred.

## Sessions and resume

Every interactive Agent Sam run receives a provider-neutral session identifier:

```text
asess_<uuid>
```

Provider response IDs live beneath the Agent Sam session and are not the public session identity. Session files are machine-local under `~/.agentsam/sessions/` and use restrictive permissions.

The session retains enough runtime state to continue a compatible provider conversation, including selected model policy, provider continuation reference, current usage snapshot, cumulative usage, accumulated catalog-calculated cost, last safe error receipt, cwd, and the last substantive user request/command used as the session title.

Housekeeping actions such as `/exit`, `/help`, and `/session` do not replace that human-readable title.

On Ctrl+C or normal exit, Agent Sam saves the session and prints a compact receipt:

```text
Token usage: total=21,463 input=21,244 (+ 60,544 cached) output=219 reasoning=...
Cost: $... · openai:gpt-6-astra · fast
Active context: ... tokens

To continue this session, run:
  agentsam resume asess_...

Or run:
  agentsam resume

and select:
  Run wrangler whoami
```

Provider-reported token usage is authoritative when available. Cached input is reported separately rather than added to normal input. Cost is calculated from Agent Sam's active model/pricing authority and is not presented as a provider invoice unless the provider supplied one.

Resume commands:

```bash
agentsam resume asess_...
agentsam resume              # scrollable recent-session picker in a TTY
agentsam resume --list
agentsam resume --json
```

Changing model, reasoning effort, or processing tier breaks provider-continuation compatibility for the next turn; Agent Sam starts a fresh provider continuation while retaining cumulative Agent Sam session accounting.

## Error presentation

Errors preserve machine identity instead of becoming generic prose. Where available the terminal should surface HTTP status, provider error type/code, request or Ray ID, retry metadata, requested/resolved service tier, and retry classification. Secrets and authorization headers are redacted before an error receipt enters model-visible output or a persisted session.

## One-shot commands

Normal commands remain deterministic and scriptable:

```bash
agentsam status
agentsam models
agentsam whoami --json
agentsam inspect --match oauth --view files --json
agentsam deploy
agentsam --help
```

`agentsam shell` remains an explicit/secondary way to enter the same shell. Bare `agentsam` is the normal interactive entrypoint.

For regression tests, a slash command can be dispatched without creating interactive-session clutter:

```bash
agentsam shell --command /help
```

## Internal UI engine

Presentation is implementation detail:

```text
Agent Sam lifecycle/state
        |
        +--> ANSI / picocolors       semantic color + cursor control
        +--> Clack prompts           arrow-key selects / confirms / text input
        +--> runtime activity        thinking/tool/context lifecycle
        +--> node-pty / host runtime real process/filesystem boundary
```

SDK developers can preview rendering experiments from this repository, but those are design-lab commands rather than installed product vocabulary.

## Local project contract

`agentsam init` owns portable repository/project setup. User identity, provider secrets, session history, execution approvals, and provider continuation state are machine/account runtime state and must not be written into portable project configuration.

Local development does not require a cloud account. Cloud infrastructure is added intentionally.

## Design rule

A CLI operation must remain understandable in plain text and deterministic in CI/pipes. Interactive terminals may enhance state with color, cursor redraw, selectors, confirmation, progress, and animation. Presentation does not authorize tools, own credentials, or silently become model-routing authority. Runtime contracts do.
