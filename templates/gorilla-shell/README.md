# Gorilla Shell (Phase 0)

Game-feel terminal UI prototype — consolidated from [InnerAnimal/gorilla-mode](https://github.com/InnerAnimal/gorilla-mode) into **Agent Sam SDK**.

This is the **unique install experience** layer: pixel HUD, themed moods, slash-command demos, deploy/benchmark scenarios. Phase 1 connects real PTY via ExecOS.

## Run locally

```bash
cd examples/gorilla-shell
npm install
npm run dev
```

## What you see

- Gorilla launch screen + sprite reactions
- Themes: NIGHT, DAY, LAVA, VOID
- Six demo scenarios (deploy, benchmark, D1, tail, samiam, wrangler)
- Slash command registry lives in `../../src/lib/slash-commands.js`

Full architecture: [docs/CLI_SHELL.md](../../docs/CLI_SHELL.md)
