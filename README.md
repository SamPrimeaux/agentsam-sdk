# Agent Sam SDK

> Build capabilities once. Run them anywhere.

Agent Sam is an execution layer for modern software teams. It turns engineering knowledge into reusable, versioned pipelines that can be executed from code, the terminal, AI agents, or a visual dashboard.

It is not just another AI SDK. Agent Sam is designed to help teams build, validate, deploy, and maintain software with AI-assisted workflows that are repeatable, inspectable, and safe to ship.

```txt
Intent
  → AgentSam pipeline
  → verified execution
  → security checks
  → deployment-ready output
  → telemetry and audit trail
```

## Why Agent Sam Exists

Most AI developer tools start with a prompt and hope the model does the right thing.

Agent Sam starts with a pipeline.

The goal is to package the best parts of software delivery into reliable commands, SDK modules, dashboard actions, and MCP tools. Whether a user clicks a button, runs a terminal command, or asks an AI agent to execute work, the same underlying workflow should run every time.

```txt
Dashboard = visual control plane
SDK       = reusable engine
CLI       = automation interface
MCP       = AI execution interface
```

## Core Principles

### Build once, expose everywhere

A capability should be built once and reused across every interface:

1. Create the workflow.
2. Refine it until it is reliable.
3. Export it through the SDK.
4. Attach a simple CLI command.
5. Surface it in the dashboard.
6. Let AI agents execute the same pipeline through MCP.

### Pipelines over prompts

Prompts are flexible, but pipelines are dependable. Agent Sam turns repeatable work into named flows with predictable inputs, outputs, checks, approvals, and logs.

### AI with guardrails

Agent Sam is meant to operate real projects. That means destructive actions, deployments, database changes, secrets, dependencies, and client work need approvals, audit trails, and security checks.

### Productized systems, not one-off templates

The long-term vision is to convert proven internal builds into reusable systems that can be installed, customized, maintained, and sold.

## Install

```bash
npm install @inneranimalmedia/agentsam-sdk
```

Or run from the terminal with `npx`:

```bash
npx @inneranimalmedia/agentsam-sdk --help
```

## Quickstart

Create a new Agent Sam project:

```bash
npx @inneranimalmedia/agentsam-sdk init \
  --name my-agent \
  --lane fullstack \
  --provider cloudflare \
  --agent orchestrator \
  --yes
```

Scaffolded projects include a Cloudflare Worker entrypoint, `wrangler.toml`, D1 migration starter, environment template, health endpoint, AgentSam message endpoint, and smoke test.

## SDK Usage

```js
import { AgentSam, scanProjectSecurity } from '@inneranimalmedia/agentsam-sdk';

const app = new AgentSam({
  project: 'my-agent',
  lane: 'fullstack',
  agent: 'orchestrator',
});

export default {
  fetch(request, env, ctx) {
    return app.handle(request, env, ctx);
  },
};

const report = await scanProjectSecurity({ projectRoot: process.cwd() });
console.log(report.ok ? 'safe to continue' : 'security review needed');
```

## CLI Usage

```bash
agentsam init
agentsam security scan
agentsam sca scan --json
agentsam sca scan --offline
```

Planned commands:

```bash
agentsam doctor
agentsam deploy
agentsam logs
agentsam status
agentsam workspace audit
agentsam cms publish
agentsam database migrate
agentsam kit install animal-rescue
```

## Capabilities

### Agents

Agent Sam routes work through specialist lanes:

| Agent | Role |
|---|---|
| Orchestrator | General-purpose planning and routing |
| CMS Agent | Pages, sections, assets, publishing, content workflows |
| Data Agent | D1, Supabase, Hyperdrive, migrations, queries, vector search |
| CRM Agent | Contacts, clients, billing, customer operations |
| Creative Agent | Design commands, media, 3D, CAD, asset pipelines |

### Execution lanes

| Lane | Environment | Purpose |
|---|---|---|
| Local | Developer machine | Fast iteration and local control |
| Cloud | Always-on VM or managed runtime | Remote work when the main machine is unavailable |
| Sandbox | Isolated environment | Safe experiments, agent tasks, tenant isolation |

### Security

Agent Sam includes the beginning of a security layer built into the SDK and CLI:

```bash
agentsam security scan
```

Current SCA support:

- Detects npm lockfiles and package manifests
- Extracts direct and transitive dependencies
- Queries OSV for known vulnerabilities
- Produces plain text or JSON reports
- Supports offline dependency inventory mode

Planned security capabilities:

- Secret scanning
- License checks
- Dependency diffing per PR
- Container image scanning
- Deployment gates
- Security scorecards per workspace

## AgentSam Kits

Kits are reusable product systems, not just code snippets.

A kit can package everything needed to launch a repeatable product or client workflow:

- UI components
- Routes and pages
- CMS fields
- Database schema
- Cloudflare configuration
- Stripe setup
- R2 asset conventions
- Agent instructions
- Security policies
- Deployment pipeline
- Brand defaults
- Smoke tests

Example kit ideas:

```bash
agentsam kit install nonprofit-cms
agentsam kit install animal-rescue
agentsam kit install stripe-campaign
agentsam kit install glass-dashboard
agentsam kit install client-portal
```

This is how Agent Sam can turn proven client work into reusable revenue products.

## Platform Architecture

Agent Sam is designed around one shared execution fabric:

```txt
User intent
  → router
  → tool catalog
  → policy and approval gate
  → execution lane
  → result formatter
  → telemetry ledger
```

The same capability should be available from:

| Interface | Purpose |
|---|---|
| SDK | Embed Agent Sam inside apps and Workers |
| CLI | Run repeatable workflows from terminal |
| Dashboard | Operate projects visually |
| MCP | Let external AI tools execute approved capabilities |

## Infrastructure Targets

Agent Sam is built for a Cloudflare-first stack with room for hybrid execution:

| Layer | Technology |
|---|---|
| Compute | Cloudflare Workers |
| Database | D1 and Supabase Postgres |
| Vector memory | Supabase pgvector / vector stores |
| Storage | R2 |
| Cache and config | Workers KV |
| Stateful sessions | Durable Objects |
| Terminal execution | Local, VM, container, or sandbox |
| Protocol | MCP |

## What Gets Scaffolded

Running `agentsam init` creates a project with:

- `agentsam.config.js`
- `wrangler.toml`
- `.env.example`
- `src/index.js`
- `migrations/0001_agentsam_core.sql`
- `scripts/smoke.mjs`
- project README

All lanes include agent sessions, messages, and tool-call tables. Specialized lanes add their own schema and workflow conventions over time.

## Roadmap

Near-term:

- Improve SCA scanner accuracy and package-manager coverage
- Add `agentsam doctor`
- Add `agentsam status`
- Add `agentsam deploy`
- Add kit registry conventions
- Add dashboard-to-CLI pipeline parity

Mid-term:

- Secret scanning
- License scanning
- PR dependency diffing
- Agent-run security summaries
- Cloudflare deployment verification
- Workspace audit reports

Long-term:

- AgentSam Kit marketplace
- Visual pipeline builder
- Multi-tenant client workspaces
- Full MCP execution surface
- Revenue-ready reusable systems for agencies, developers, and small teams

## Development

```bash
npm install
npm test
```

Smoke tests currently validate the AgentSam handler, router, scaffold flow, and offline SCA dependency scan.

## License

MIT

## Built By

Agent Sam is built by Inner Animal Media as the operator layer behind its software, client systems, CMS workflows, and AI-assisted development platform.
