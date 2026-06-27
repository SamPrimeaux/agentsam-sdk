# Agent Sam SDK

> The AI agent layer for developers who need more than a chatbot.

Agent Sam is a full-stack autonomous agent SDK built on Cloudflare Workers, D1, Supabase, Durable Objects, and MCP — designed to converse, plan, and execute real work across your entire stack. CMS websites, full-stack applications, data pipelines, creative workflows, terminal execution, deployments, and multi-step agentic pipelines — all through one unified agent interface.

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

\`\`\`bash
npx @inneranimalmedia/agentsam-sdk init
\`\`\`

You will be guided through:

- **Lane selection** — Full Stack, CMS, Data Solutions, Customer Management, or Creative & Design
- **Provider** — Cloudflare Workers, GitHub + Cloudflare, or Local / Self-hosted
- **Default agent** — Orchestrator, CMS, Data, CRM, or Creative
- **Project scaffolding** — config, worker template, D1 migrations, KV bindings, Durable Objects, env setup — all generated for your lane

---

## Installation

\`\`\`bash
npm install @inneranimalmedia/agentsam-sdk
\`\`\`

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

\`\`\`
User Intent (chat or CLI)
        ↓
   Agent Sam — intent classification + command match
        ↓
   Tool Catalog (D1) — policy check + approval gate
        ↓
   Execution — terminal / D1 / Supabase / R2 / KV / DO / browser / deploy / MCP
        ↓
   Telemetry — every action logged, measured, improvable
\`\`\`

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

Running \`agentsam init\` generates a production-ready project for your lane:

**All lanes include:**
- \`agentsam.config.js\` — project config, lane, provider, agent
- \`wrangler.toml\` — Worker, D1, R2, KV, Durable Object bindings
- \`.env.example\` — all required secrets pre-listed
- \`src/index.js\` — Worker entry point wired to your agent
- \`README.md\` — setup and deploy instructions

**CMS lane adds:**
- Page, section, asset, and theme schema migrations
- CMS worker with live edit, draft/publish, and R2 asset pipeline

**Data lane adds:**
- D1 + Supabase Hyperdrive connection config
- Vector embedding pipeline scaffold
- Migration templates for core data models

**Full Stack adds:**
- Durable Object session scaffold
- Auth tables and session management
- Full agent chat + tool loop worker

---

## Multi-Tenant & Client Policy

Agent Sam is built for isolation from the ground up:

- Each user or client gets a scoped workspace
- Terminal execution is path-isolated — no cross-tenant access
- AI usage is policy-gated — BYOK, managed, or disabled per client
- D1 and R2 are scoped per tenant at the binding level
- Every action produces an audit trail

---

## Roadmap

- [ ] \`agentsam deploy\` — push your project from CLI
- [ ] \`agentsam status\` — live agent and infrastructure health
- [ ] \`agentsam logs\` — tail tool call and command logs
- [ ] \`agentsam kit\` — install pre-built capability kits
- [ ] Kit marketplace — CMS, ecommerce, nonprofit, SaaS starters
- [ ] BYOK AI key support per project

---

## Built By

[Inner Animal Media](https://inneranimalmedia.com) — Agent Sam is the operator brain behind the Inner Animal Media platform. The SDK is how we share that infrastructure with other developers.

---

## License

MIT
