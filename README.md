# Agent Sam SDK

> The AI agent layer for developers who need more than a chatbot.

Agent Sam is a full-stack autonomous agent SDK built on Cloudflare Workers, D1, Supabase, Durable Objects, and MCP — designed to converse, plan, and execute real work across your entire stack. CMS websites, full-stack applications, data pipelines, creative workflows, terminal execution, deployments, and multi-step agentic pipelines — all through one unified agent interface.

**Repo:** [github.com/SamPrimeaux/agentsam-sdk](https://github.com/SamPrimeaux/agentsam-sdk) · **npm:** `@inneranimalmedia/agentsam-sdk`

**Protocol:** [`protocol/README.md`](./protocol/README.md) — this repository is the canonical home for portable SDK code. Host applications consume the package and supply adapters; they do not mirror its source tree. Python lane: [`python/`](./python/) (stdlib-only). Optional network Python package: [`packages/agentsam-site-scrape/`](./packages/agentsam-site-scrape/).

**Repository knowledge:** run `agentsam init` inside an existing Git repository, or `agentsam init . --yes --include src,docs` for explicit setup. `agentsam index plan` previews work; `agentsam index run` builds a local AST/text index without embedding calls. See [portable knowledge](./docs/portable-knowledge.md) for Gemini, Postgres, saved evolution snapshots, and package verification.

---

## What is Agent Sam?

Agent Sam is a platform operator AI. It sits on top of your infrastructure and can:

- **Understand intent** — natural language in, real actions out
- **Execute across surfaces** — terminal, database, browser, CAD, deploy, MCP tools
- **Route intelligently** — local machine, cloud VM, or sandboxed environment based on context
- **Gate high-risk actions** — approval flows before anything destructive runs
- **Leave an audit trail** — every tool call, command run, and decision is logged

It is not a wrapper around a chat API. It is a command fabric with a conversation interface.

---

## Quickstart (local-first — Node only)

```bash
npx @inneranimalmedia/agentsam-sdk init --name my-agent --yes
cd my-agent
```

Default path: **local**. No IAM login, Cloudflare account, tunnel, hosted database, or Worker is required. Node 22.5+ is required because local persistence uses Node's built-in SQLite. Run `npx @inneranimalmedia/agentsam-sdk init` with no flags for the interactive setup.

`agentsam init` creates the project directory, initializes Git, writes `.env` + `.env.example`, creates `db/schema.sql`, and initializes `.agentsam/data/agentsam.sqlite` before you install project dependencies.

```bash
npm install
npm run smoke             # health + real SQLite persistence proof
npm run status            # Git + SQLite + API + PTY truth
npm run dev               # local Node API :8787
npm run tui               # Agent Sam ANSI dashboard
npm run db:status         # local SQLite receipt
npm run pty               # optional local PTY :3099
```

The richer Python presentation is optional and isolated:

```bash
npm run tui:rich -- --install
```

This creates `.agentsam/tui-venv` and installs Rich there. It does not modify your system Python.

`agentsam tunnel` is an explicit remote-access step. It is not part of local startup. When used, it exposes the local PTY so an authorized remote Agent Sam surface can reach your machine.
When you're ready to ship to **your** Cloudflare account:

```bash
npx agentsam deploy
```

Cloudflare OAuth is prompted **only at deploy** — not at init.

Non-interactive init:

```bash
npx @inneranimalmedia/agentsam-sdk init \
  --name my-agent \
  --lane fullstack \
  --run-target local \
  --yes
```

Run targets at init: `local` (default) · `cloudflare` · `gcp` — all scaffold locally first; cloud credentials come at deploy.

See [DEVELOPMENT.md](./DEVELOPMENT.md) for linking the SDK into Inner Animal Media locally.

---

## Mini gadgets and quick previews

```bash
agentsam mini focus-timer --open
agentsam mini landing --template page
agentsam mini json-viewer --template data
agentsam mini sketch --write-only
agentsam mini preview ./sketch
```

A mini is a small folder of HTML, CSS, and JavaScript with no install step. Previews run locally in the foreground, stop with Ctrl+C, and automatically close after 20 minutes. Files remain for reuse. Use `--timeout <seconds>` to change the lifetime. See [Mini](docs/MINI.md) for starters and options.

---

## Merkle integrity and tree explorer

```bash
agentsam merkle root .
agentsam merkle snapshot .
agentsam merkle verify .agentsam/merkle.json --tui
agentsam merkle diff ./copy-a ./copy-b --json
agentsam tui merkle .
```

Deterministic SHA-256 file trees work with any directory. Save a baseline, compare copies, or explore changed branches with keyboard navigation and live rescan. Only `snapshot` writes files. See [Merkle CLI](docs/MERKLE.md) for ignore rules, JSON output, and cross-machine verification.

---

## Dependency health and verified repair

```bash
agentsam security scan
agentsam security check --log /tmp/deploy.log --json
agentsam security run -- npm run build
agentsam security repair --apply --verify verify
```

Scan exact npm lockfile versions against OSV, turn install/deployment warnings into structured actions, and prepare repairs in an isolated Git worktree. Repairs must pass installation, project verification, and a fresh scan. Offline or incomplete checks cannot report success. CI and alpha publishing enforce dependency health; weekly maintenance prepares verified repair branches and PRs when repository settings permit. See [Dependency health](docs/SECURITY.md) for coverage, exit codes, and automation behavior.

## Agent Sam terminal experience

The CLI has two presentation layers over the same local tooling:

```bash
agentsam tui                         # zero-dependency Node/ANSI dashboard
agentsam tui --scene logs            # ANSI scene
agentsam tui rich                    # Python Rich dashboard, if available
agentsam tui rich --install          # isolated .agentsam/tui-venv
agentsam shell                       # command catalog + PTY/DB/TUI status
```

The ANSI renderer is the default because it ships with the npm package and needs no second runtime. The Rich renderer is the higher-fidelity optional presentation for live cards, progress, event tables, logs, and staged job receipts.

Gorilla remains in `templates/gorilla-shell/` as a visual experiment/theme reference. It is **not** scaffolded by default and is not the shell architecture.

| Piece | Location |
|-------|----------|
| Slash command registry | `src/lib/slash-commands.js` |
| ANSI renderer | `examples/agentsam-tui-ansi.mjs` |
| Rich renderer | `python/agentsam_sdk/tui/` |
| Reusable browser components | `packages/agentsam-shell-kit/` |
| Legacy Gorilla experiment | `templates/gorilla-shell/` |
| Architecture | [docs/CLI_SHELL.md](./docs/CLI_SHELL.md) |

---

## Architecture (CORE default)

`src/lib/core-client.js` defaults to `https://inneranimalmedia.com`. **Correct as designed** for serving many client projects: the npm package is a thin delivery/CLI client; intelligence, tool catalog, and policy live server-side on IAM CORE.

Without an IAM backend (or `IAM_CORE_URL` / `AGENTSAM_CORE_URL` override), strangers who `npm install` get **scaffold + local CLI only** — not a freestanding hosted Agent Sam.

---

## Installation

```bash
npm install @inneranimalmedia/agentsam-sdk
```

---

## Lanes

| Lane | Best For |
|------|----------|
| **Full Stack** | End-to-end apps — agent chat, terminal, deploy, D1, R2, Durable Objects, KV |
| **CMS** | Content-managed websites — pages, assets, themes, navigation, live edit |
| **Data Solutions** | Database ops, migrations, queries, Supabase pgvector, Hyperdrive pipelines |
| **Customer Management** | CRM, contacts, billing, client workflows, multi-tenant isolation |
| **Creative & Design** | CAD, 3D, media generation, content pipelines |

---

## Agents

| Agent | Role |
|-------|------|
| **Orchestrator** | General purpose — routes across all lanes and tools |
| **CMS Agent** | Pages, sections, assets, themes, publishing workflows |
| **Data Agent** | D1, Supabase, Hyperdrive, migrations, vector search |
| **CRM Agent** | Customer records, contacts, billing, client isolation |
| **Creative Agent** | Design commands, 3D generation, CAD, media pipelines |

---

## How It Works

```
User Intent (chat or CLI)
        ↓
   Agent Sam — intent classification + command match
        ↓
   Tool Catalog (D1) — policy check + approval gate
        ↓
   Execution — terminal / D1 / Supabase / R2 / KV / DO / browser / deploy / MCP
        ↓
   Telemetry — every action logged, measured, improvable
```

Capabilities are data-driven — new tools are added via D1, not Worker redeployments. The same tool catalog powers the dashboard, the CLI, and any MCP-connected client like Cursor or Claude Desktop.

---

## Infrastructure

Agent Sam scaffolds and operates across the full Cloudflare + Supabase stack:

| Layer | Technology | Role |
|-------|------------|------|
| **Compute** | Cloudflare Workers | Edge runtime, API, agent dispatch |
| **Relational DB** | D1 (SQLite) | Tool catalog, sessions, telemetry, CMS, auth |
| **Vector DB** | Supabase pgvector via Hyperdrive | RAG, semantic search, agent memory |
| **Object Storage** | R2 | Assets, media, bundles, CMS content |
| **Key-Value** | Workers KV | Cache, CMS drafts, feature flags |
| **Stateful Sessions** | Durable Objects | Terminal sessions, collab, real-time state |
| **Terminal** | ExecOS over cloudflared tunnel | Shell execution, deploy, git, wrangler |
| **AI Router** | Anthropic + OpenAI | Adaptive Thompson sampling across models |
| **Protocol** | MCP (Model Context Protocol) | External agent surface for Cursor, Claude, etc. |

---

## Execution Lanes

Agent Sam routes work to the right environment automatically:

| Lane | Environment | When |
|------|-------------|------|
| Local | Your machine | Fastest dev loop |
| Cloud | Always-on VM via tunnel | Machine asleep or offsite |
| Sandbox | Isolated workspace | Safe experiments, tenant isolation |

---

## What Gets Scaffolded

Running `agentsam init` generates a portable local project first:

**All lanes include:**
- a new Git repository
- `agentsam.config.js` — project/lane/agent configuration
- `.env` + `.env.example` — local configuration
- `.agentsam/config.json` — Agent Sam local project metadata
- `.agentsam/data/agentsam.sqlite` — initialized local SQLite state
- `db/schema.sql` — portable relational schema
- `src/agent.js` — runtime-neutral Agent Sam application factory
- `src/dev-server.js` — local Node HTTP adapter
- `scripts/smoke.mjs` — health + SQLite persistence proof
- ANSI and optional Rich TUI commands through the installed SDK

Lane-specific schema additions remain local-first. For example, CMS adds CMS tables to `db/schema.sql`.

Cloudflare files are **not** emitted during local init. `agentsam deploy --target cloudflare` generates the Worker adapter, `wrangler.toml`, and a D1 migration from the same local schema when cloud infrastructure is intentionally requested.

---

## Multi-Tenant & Client Policy

- Authenticated user/session identity is the primary security boundary
- Workspaces may organize projects but are not required to run local tooling
- Terminal execution is user/path scoped — no cross-user access
- AI usage can be BYOK, managed, or disabled by policy
- Cloud storage bindings are isolated when a project graduates to hosted infrastructure
- Every privileged action should produce an audit trail

---

## Roadmap

- [x] `agentsam init` — local Git + `.env` + SQLite + runtime-neutral Node agent
- [x] `agentsam status` — live Git + SQLite + API + PTY health
- [x] `agentsam tui` — zero-dependency ANSI live status + explicit demo scenes
- [x] `agentsam tui rich` — optional Rich live status with isolated local venv install
- [x] `agentsam shell` — terminal command catalog over the same local capabilities
- [x] `agentsam start-local` — local PTY server on the user's machine
- [x] `agentsam deploy` — add cloud adapters intentionally at deploy time
- [x] Identity alpha — contracts, providers, auth portal preview (`agentsam identity preview`)
- [x] Gorilla Phase 0 retained as an optional visual experiment, not the default shell
- [ ] `agentsam logs` — tail local/tool execution events through the terminal UX
- [ ] Interactive PTY command bridge inside the TUI
- [ ] Publish reusable browser shell-kit surfaces
- [ ] Kit marketplace — CMS, ecommerce, nonprofit, SaaS starters
- [ ] BYOK AI key support per project

---

## Built By

[Inner Animal Media](https://inneranimalmedia.com) — Agent Sam is the operator brain behind the platform. The SDK is how we productize that infrastructure for other developers.

**Legacy:** [InnerAnimal/gorilla-mode](https://github.com/InnerAnimal/gorilla-mode) → consolidated here.

---

## License

MIT
