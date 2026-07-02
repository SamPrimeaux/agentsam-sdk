# Agent Sam SDK

> The AI agent layer for developers who need more than a chatbot.

Agent Sam is a full-stack autonomous agent SDK built on Cloudflare Workers, D1, Supabase, Durable Objects, and MCP — designed to converse, plan, and execute real work across your entire stack. CMS websites, full-stack applications, data pipelines, creative workflows, terminal execution, deployments, and multi-step agentic pipelines — all through one unified agent interface.

**Repo:** [github.com/SamPrimeaux/agentsam-sdk](https://github.com/SamPrimeaux/agentsam-sdk) · **npm:** `@inneranimalmedia/agentsam-sdk`

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

## Quickstart

```bash
npx @inneranimalmedia/agentsam-sdk init
```

One command. Agent Sam (on IAM CORE) authenticates you, provisions D1/R2/KV in **your** Cloudflare account, writes **your** repo locally, and registers LOCAL-USER PTY. No IAM repo clone. No credential hunting.

Non-interactive (after you have an SDK bearer):

```bash
npx @inneranimalmedia/agentsam-sdk init \
  --name my-agent \
  --lane fullstack \
  --hosting local \
  --token "$AGENTSAM_SDK_TOKEN" \
  --yes
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for linking the SDK into Inner Animal Media locally.

---

## CLI Shell Experience (Gorilla)

The SDK ships a **game-feel terminal UX** alongside the scaffold CLI — consolidated from the Gorilla Mode experiment:

```bash
npx @inneranimalmedia/agentsam-sdk shell
```

| Piece | Location |
|-------|----------|
| Slash command registry | `src/lib/slash-commands.js` |
| Phase 0 visual prototype | `examples/gorilla-shell/` |
| Architecture + phases | [docs/CLI_SHELL.md](./docs/CLI_SHELL.md) |

Run the prototype:

```bash
cd examples/gorilla-shell && npm install && npm run dev
```

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

Running `agentsam init` generates a production-ready project for your lane:

**All lanes include:**
- `agentsam.config.js` — project config, lane, provider, agent
- `wrangler.toml` — Worker, D1, R2, KV, Durable Object bindings
- `.env.example` — all required secrets pre-listed
- `src/index.js` — Worker entry point wired to your agent
- `README.md` — setup and deploy instructions

**CMS lane adds:** page/section/asset schema migrations and CMS worker scaffold.

**Data lane adds:** D1 + Hyperdrive config and migration templates.

**Full Stack adds:** Durable Object session scaffold, auth tables, full agent chat loop.

---

## Multi-Tenant & Client Policy

- Each user or client gets a scoped workspace
- Terminal execution is path-isolated — no cross-tenant access
- AI usage is policy-gated — BYOK, managed, or disabled per client
- D1 and R2 are scoped per tenant at the binding level
- Every action produces an audit trail

---

## Roadmap

- [x] `agentsam shell` — shell UX info + slash command registry
- [x] Gorilla Shell Phase 0 prototype in `examples/gorilla-shell/`
- [ ] `agentsam deploy` — push your project from CLI
- [ ] `agentsam status` — live agent and infrastructure health
- [ ] `agentsam logs` — tail tool call and command logs
- [ ] PTY bridge (Phase 1) — ExecOS WebSocket in shell
- [ ] Kit marketplace — CMS, ecommerce, nonprofit, SaaS starters
- [ ] BYOK AI key support per project

---

## Built By

[Inner Animal Media](https://inneranimalmedia.com) — Agent Sam is the operator brain behind the platform. The SDK is how we productize that infrastructure for other developers.

**Legacy:** [InnerAnimal/gorilla-mode](https://github.com/InnerAnimal/gorilla-mode) → consolidated here.

---

## License

MIT
