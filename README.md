# Agent Sam SDK

> The AI agent layer for developers who need more than a chatbot.

Agent Sam is a full-stack autonomous agent SDK built on Cloudflare Workers, D1, and MCP — designed to converse, plan, and execute real work across your entire stack. Data management, creative workflows, terminal execution, deployments, and multi-step agentic pipelines — all through one unified agent interface.

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

- **Lane selection** — Full Stack, Data Solutions, Customer Management, or Creative & Design
- **Provider** — Cloudflare Workers, GitHub + Cloudflare, or Local / Self-hosted
- **Default agent** — Orchestrator, Data, CRM, or Creative
- **Project scaffolding** — config, worker template, migrations, env setup — all generated for your lane

---

## Installation

\`\`\`bash
npm install @inneranimalmedia/agentsam-sdk
\`\`\`

---

## Lanes

| Lane | Best For |
|------|----------|
| **Full Stack** | End-to-end apps — agent chat, terminal, deploy, D1, R2 |
| **Data Solutions** | Database ops, migrations, queries, pipelines |
| **Customer Management** | CRM, contacts, billing, client workflows |
| **Creative & Design** | CAD, 3D, media generation, content pipelines |

---

## Agents

| Agent | Role |
|-------|------|
| **Orchestrator** | General purpose — routes across all lanes and tools |
| **Data Agent** | Database operations, schema management, queries |
| **CRM Agent** | Customer records, contacts, billing workflows |
| **Creative Agent** | Design commands, 3D generation, media pipelines |

---

## How It Works

\`\`\`
User Intent (chat or CLI)
        ↓
   Agent Sam — intent classification + command match
        ↓
   Tool Catalog (D1) — policy check + approval gate
        ↓
   Execution — terminal / database / browser / deploy / MCP
        ↓
   Telemetry — every action logged, measured, improvable
\`\`\`

Capabilities are data-driven — new tools are added via D1, not Worker redeployments. The same tool catalog powers the dashboard, the CLI, and any MCP-connected client like Cursor or Claude Desktop.

---

## Execution Lanes

Agent Sam routes work to the right environment automatically:

| Lane | Environment | When |
|------|-------------|------|
| Local | Your machine | Fastest dev loop |
| Cloud | GCP VM via tunnel | Always-on, Mac asleep |
| Sandbox | Isolated workspace | Safe experiments, client isolation |

---

## Multi-Tenant & Client Policy

Agent Sam is built for isolation from the ground up:

- Each client or user gets a scoped workspace
- Terminal execution is path-isolated — no cross-tenant access
- AI usage is policy-gated — BYOK, managed, or disabled per client
- Every action produces an audit trail

---

## Stack

- **Runtime** — Cloudflare Workers
- **Database** — D1 (SQLite) + Supabase pgvector
- **Storage** — R2
- **Terminal** — ExecOS over cloudflared tunnel
- **AI** — Anthropic + OpenAI via adaptive Thompson sampling router
- **Protocol** — MCP (Model Context Protocol)

---

## Roadmap

- [ ] agentsam deploy — push your project from CLI
- [ ] agentsam status — live agent and infrastructure health
- [ ] agentsam logs — tail tool call and command logs
- [ ] Kit marketplace — pre-built lane configurations
- [ ] BYOK AI key support per project

---

## Built By

Inner Animal Media — Lafayette, Louisiana.

Agent Sam is the operator brain behind the Inner Animal Media platform. The SDK is how we share that infrastructure with other developers.

---

## License

MIT
