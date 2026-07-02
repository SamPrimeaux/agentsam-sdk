# Agent Sam SDK — CLI Shell Experience

The SDK ships two complementary surfaces:

1. **`agentsam init`** — scaffold Workers + D1 + agent loop (resell/scale path)
2. **Gorilla Shell** (`examples/gorilla-shell/`) — game-feel terminal UX layer (unique install experience)

Gorilla Mode was consolidated from the standalone [InnerAnimal/gorilla-mode](https://github.com/InnerAnimal/gorilla-mode) experiment into this repo. **Do not start new work in gorilla-mode** — extend here.

---

## Why a game shell?

Developers installing `@inneranimalmedia/agentsam-sdk` get:

- Efficient tooling (`init`, future `deploy` / `status` / `logs`)
- A **memorable CLI identity** — pixel HUD, slash commands, themed moods, deploy reactions

The shell is not a toy terminal emulator. It is a **presentation layer** on real PTY + MCP + D1 tool execution — the same stack IAM runs in production.

---

## Architecture

```
User
  └─ agentsam shell (CLI) or embedded <AgentSamShell />
       └─ Gorilla HUD (themes, sprite, quest log)
            └─ xterm.js ↔ ExecOS / iam-pty WebSocket
                 └─ Slash commands → SDK router → MCP / wrangler / D1
```

| Layer | Location in SDK |
|-------|-----------------|
| Slash command registry | `src/lib/slash-commands.js` |
| Phase 0 visual prototype | `examples/gorilla-shell/App.tsx` |
| Scaffold + Worker agent | `src/lib/scaffold.js`, `src/AgentSam.js` |
| Future PTY bridge | `src/lib/shell/` (Phase 1) |

---

## Phases

See `SHELL_PHASES` in `src/lib/slash-commands.js`. Current status:

| Phase | Status |
|-------|--------|
| 0 — Visual prototype | **Complete** (demo scenarios, themes, sprite) |
| 1 — Real PTY | **Next** — wire to ExecOS / `terminal.inneranimalmedia.com` |
| 2 — HUD (quest log, tool gate, XP) | Planned |
| 3 — Buddy (`/buddy`, MCP stream) | Planned |
| 4 — Dashboard embed | Planned |
| 5 — Standalone PWA as SDK default | Planned |

---

## Run the prototype

```bash
cd examples/gorilla-shell
npm install
npm run dev
```

Deploy preview (Cloudflare Pages):

```bash
npm run build
npx wrangler pages deploy dist
```

---

## Platform linkage (IAM)

| Shell feature | IAM SSOT |
|---------------|----------|
| PTY sessions | `terminal_connections` + ExecOS |
| Tool execution | `agentsam_tools` → catalog executor |
| Buddy / MCP | `mcp.inneranimalmedia.com` |
| XP (future) | `gorilla_xp` D1 table |
| Themes (future) | user preferences / `cms_themes` pattern |

---

## Repo history

- **Before:** `InnerAnimal/gorilla-mode` (Phase 0 only, single-file React artifact)
- **Now:** `SamPrimeaux/agentsam-sdk/examples/gorilla-shell`
- **D1 project:** `proj_agentsam_sdk` (replaces `proj_gorilla_mode` on the IAM projects grid)
