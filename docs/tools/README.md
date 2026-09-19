# AgentSam Tools Reference

Generated from the live `agentsam_tools` D1 registry (218 tools, `inneranimalmedia-business` database) on 2026-09-19. This is a **reference index**, not source of truth — the registry itself is authoritative; re-generate this if the registry drifts significantly.

**Why this exists:** before building a new tool, writing a new scaffold capability, or reaching for a raw shell command to do something the platform already has a tool for, check here first. The whole point is to stop re-deriving things that already exist — this was the exact failure mode a prior audit of `agentsam-sdk` flagged repeatedly.

**Stats:** 218 total · 206 active · 12 inactive · 31 high-risk · 153 never invoked (in this registry's tracked history).

## Find a tool by domain

| Domain | Tools | What's here |
|---|---|---|
| [Agent & Orchestration](./agent-and-orchestration.md) | 17 | Spawning subagents, running workflows, planning, multitask fan-out, and repo intelligence for an agent's own reasoning. |
| [Browser & Research](./browser-and-research.md) | 20 | Automated browser control (Playwright), screenshots, script evaluation, quick-actions (scrape/crawl/PDF/markdown/links/JSON extract), AutoRAG search, and general web search/fetch. |
| [Cloudflare Platform](./cloudflare-platform.md) | 9 | Account-level Cloudflare operations: listing Workers/D1/KV/R2, fetching Worker code, and searching Cloudflare docs. NOT data operations inside those resources — see Database & Storage for that. |
| [CMS](./cms.md) | 17 | The real CMS execution pipeline — page/block/section create+update, publish, site-shell save, and the CMS pipeline bootstrap/extract/inject/prototype steps. This is the canonical content system; do not reinvent a thinner one in a scaffold. |
| [Communications](./communications.md) | 21 | Email (agentsam_send_email and the full official Gmail MCP surface), iMessage (send/approval), and app push notifications. |
| [Database & Storage](./database-and-storage.md) | 15 | D1 (query/write/delete), Supabase (query/vector/write), Hyperdrive, R2 (get/put/list/delete), KV, Vectorize, and Cloudflare Images. |
| [Design & Media](./design-and-media.md) | 35 | Excalidraw canvas, CAD generation/jobs, Design Studio blueprints/scenes/assets, image generation/upload, video generation/embed, and the full Meshy 3D pipeline (text-to-3D, image-to-3D, rig, retexture, remesh, UV unwrap). |
| [Filesystem & Code](./filesystem-and-code.md) | 20 | Reading/writing/searching files, AST-level codebase retrieval, code index builds, Merkle diffing, and knowledge ingestion. |
| [GitHub](./github.md) | 36 | Every GitHub read (repos, branches, commits, PRs, issues, workflow runs) and write (commit, patch, branch, PR, comment) operation. |
| [Integrations & Misc](./integrations-and-misc.md) | 5 | Google Drive, Resend (inactive), and raw HTTP fetch (inactive). |
| [Memory](./memory.md) | 4 | Agent Sam's own memory commit/search/save/manager surface — semantic memory, not to be confused with this assistant's own memory system. |
| [Terminal & Execution](./terminal-and-execution.md) | 6 | Running shell/Python/Node commands — on the user's own Mac, the always-on cloud desk, or an isolated sandbox — plus container batch exec and Code Mode. |
| [Tickets & Platform](./tickets-and-platform.md) | 13 | The ticket lifecycle (create/get/list/set-status/add-note), plus platform-level admin: MCP audit log, ship-check, checkout-root pin/get/clear, ping. |

## Quick lookup — common needs → domain

- **Run a shell command** (local Mac / cloud desk / sandbox) → [Terminal & Execution](./terminal-and-execution.md)
- **Read/write/search files, retrieve code by AST** → [Filesystem & Code](./filesystem-and-code.md)
- **Query or write D1/Supabase/R2/KV/Vectorize** → [Database & Storage](./database-and-storage.md)
- **List/inspect Workers, KV namespaces, R2 buckets at the account level** → [Cloudflare Platform](./cloudflare-platform.md)
- **Create/edit/publish a page, block, or section** → [CMS](./cms.md) — do not reinvent this with a scaffold
- **GitHub read or write of any kind** → [GitHub](./github.md)
- **Browser automation, scraping, web search** → [Browser & Research](./browser-and-research.md)
- **Generate an image/video/3D asset, or use Design Studio/CAD** → [Design & Media](./design-and-media.md)
- **Send email, iMessage, or a push notification** → [Communications](./communications.md)
- **Spawn a subagent, run a workflow, build a plan** → [Agent & Orchestration](./agent-and-orchestration.md)
- **Semantic memory commit/search** → [Memory](./memory.md)
- **Track a ticket, check ship status, audit MCP calls** → [Tickets & Platform](./tickets-and-platform.md)

## Before you build a new tool: check for collisions

5 `handler_key` values are shared by more than one distinct `tool_name` in the registry today. A shared handler_key is the strongest signal that a tool already does what you're about to build — check these before adding anything new:

- `handler_key: codebase_ast` → `agentsam_codebase_retrieve`, `agentsam_knowledge_ingest_segment`
- `handler_key: github_create_pr` → `agentsam_github_pr`, `agentsam_github_pr_create`
- `handler_key: github_search_code` → `agentsam_github_grep`, `agentsam_github_search`
- `handler_key: memory` → `agentsam_memory_commit`, `agentsam_memory_manager`, `agentsam_memory_save`, `agentsam_memory_search`
- `handler_key: notify` → `agentsam_notify`, `agentsam_send_email`

## Legend

- **inactive** — `is_active = 0` in the registry; do not suggest these without checking why they're off first.
- **risk: high** — `requires_approval`-tier or destructive; confirm before calling.
- **★ heavily used** — ≥100 recorded calls; these are the proven, load-bearing tools for their domain.
- **never used** — 0 recorded calls. Not necessarily dead — could be newly registered — but worth a second look before assuming it works as documented.
