# Agent Sam SDK — terminal experience

`agentsam` is the product entrypoint. Users do not choose a renderer or need to know whether a screen is implemented with ANSI, Rich, Clack, or another terminal library.

## Product entrypoint

```bash
agentsam
```

On the first run for a project, Agent Sam opens keyboard-driven setup for the project, runtime, terminal, and model preference. On later runs it shows a short project-aware boot transition and enters the Agent Sam prompt.

```text
$ agentsam

  Agent Sam
  my-project · main · qwen2.5-coder

  ✓ project
  ✓ runtime
  ✓ model

  username ~/path/to/project >
```

The model stored by the CLI is a **preference only**. It does not replace the connected host/runtime as model-routing authority.

Use `/settings` inside Agent Sam to revisit the keyboard choices and `/models` to inspect providers and locally available models.

## One-shot commands

Normal commands remain deterministic and scriptable:

```bash
agentsam status
agentsam models
agentsam inspect --json
agentsam deploy
agentsam --help
```

`agentsam shell` remains an explicit/secondary way to enter the slash-command shell. Bare `agentsam` is the normal interactive entrypoint.

For regression tests, one slash command can still be dispatched without opening an interactive terminal:

```bash
agentsam shell --command /help
```

## Internal UI engine

The renderer is implementation detail:

```text
Agent Sam lifecycle/state
        |
        +--> ANSI / picocolors       semantic color + cursor control
        +--> Rich renderer           high-fidelity live render experiments
        +--> Clack prompts           arrow-key selects / confirms / text input
        +--> node-pty                real shell/process/filesystem
```

SDK developers can preview render experiments from this repository without exposing renderer names as product commands:

```bash
npm run ui:preview -- tour
npm run ui:preview -- boot
npm run ui:preview -- setup
npm run ui:preview -- thinking
npm run ui:preview -- ready
npm run ui:preview -- ansi
```

These preview commands are a design lab, not part of the installed user vocabulary.

## Slash commands

```text
/help       show commands
/status     local project / DB / Git / PTY health
/context    current repository + revision
/pwd        working directory
/cd         change working directory
/git        Git operations
/db         local SQLite
/agent      invoke configured Agent Sam
/models     inspect available providers and local models
/settings   choose project/runtime/terminal/model preference
/logs       local execution events
/deploy     intentionally add a cloud adapter
/exit       exit Agent Sam and return to the host terminal
```

Provider-specific commands such as `/claude` or `/codex` are not part of the generic shell contract. Model execution/routing belongs behind Agent Sam.

## Local project contract

`agentsam init` creates a local project with Git, `.env`, `.agentsam/config.json`, a committed `.agentsamrules` project-instruction file, local SQLite, and the project runtime files. The setup wizard uses keyboard-driven Clack prompts in an interactive terminal; flags keep non-interactive creation deterministic.

Local development requires no Worker or cloud account. Cloud infrastructure is added intentionally at deploy time.

## Design rule

A CLI operation must remain understandable in plain text and deterministic in CI/pipes. Interactive terminals may enhance that state with color, cursor redraw, prompts, progress, and animation. Presentation does not authorize tools, own execution policy, or silently become model-routing authority.
