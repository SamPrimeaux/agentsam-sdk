# AgentSam SDK

A deterministic-first application and agent toolkit: reusable repository, knowledge, integrity,
security, identity, scaffolding, and delivery capabilities with optional AgentSam/LLM composition.
The interactive CLI can run the same bounded capabilities through an explicitly selected model while
keeping model choice, reasoning effort, processing tier, credentials, approvals, context, and cost inspectable.

**SAM** = **Systems Automation Machinery** — the execution spine under AgentSam (not a person).
The conventional client variable is `sam`:

```js
import { AgentSamClient } from '@inneranimalmedia/agentsam-sdk';

const sam = new AgentSamClient();
const repo = await sam.invoke('repository.inspect', { root: '.' });
// or: await sam.repository.inspect({ root: '.' });
console.log(repo.data.summary, repo.receipt.id);
```

See [SAM Kernel](docs/architecture/SAM_KERNEL.md) for `invoke` / `describe` / `discover`,
operation IDs, and the universal `SamResult` envelope.

**npm:** `@inneranimalmedia/agentsam-sdk` · **Source:** [GitHub](https://github.com/SamPrimeaux/agentsam-sdk)

Node 22.5+ is required. Docker is optional for container commands. Python 3.10+ is required
for the bundled Python repository tools. Rich is optional for the contributor-only terminal renderer lab.
See [release receipts](docs/RELEASES.md) for publication status.

## Install

```sh
npm install @inneranimalmedia/agentsam-sdk
# Or install the CLI globally:
npm install -g @inneranimalmedia/agentsam-sdk
```

Or install without a local Node/npm setup via the hosted installer (currently
an npm-bootstrap script; standalone SEA binaries are planned, not shipped yet):

```sh
curl -fsSL https://agentsam.inneranimalmedia.com/install | bash
# a specific version, channel, or bundled app launcher:
curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --version 2.6.3
curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --channel beta
curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --app cad
```

The identity workspace is included through `@inneranimalmedia/agentsam-sdk/identity`.
It is not a separate npm installation. A container is not required to import SDK modules
or use local scaffolding/indexing.

## Create a local application

```sh
agentsam create my-agent --preset fullstack
cd my-agent
npm install
npm run smoke
agentsam dev
```

Presets are deterministic configuration bundles, not model prompts. Available starting presets are
`fullstack`, `cms`, `prototype`, and `data`; they select an existing scaffold lane plus explicit feature
and capability IDs. They do not silently provision cloud resources. The older
`agentsam init --name my-agent --yes` scaffold entry point remains available for compatibility.

The generated project contains a Git repository, local SQLite database, environment templates, a Node
API, and terminal commands. Local setup does not require an IAM account, cloud credentials, a model, or
a tunnel. Use `agentsam add <feature>` to record an explicit feature selection and its capability set.

AgentSam's own local session and run state uses one SQLite database at
`<projectRoot>/.agentsam/data/agentsam.sqlite`. A deployed project's application
storage remains its declared infrastructure; see [storage architecture](docs/architecture/STORAGE.md).

Without a global install, use `npx @inneranimalmedia/agentsam-sdk create my-agent --preset fullstack`.

## MCP setup

Cloudflare's API MCP server uses `https://mcp.cloudflare.com/mcp`. Add that URL
to the agent client you use, then complete its Cloudflare OAuth flow. For Codex:

```sh
codex mcp add cloudflare-api --url https://mcp.cloudflare.com/mcp
codex mcp login cloudflare-api
```

`agentsam mcp add cloudflare-api --url https://mcp.cloudflare.com/mcp` is not
currently an AgentSam CLI command. The repo's `.agentsam/config.json` is a
portable project manifest, not an MCP client configuration; it cannot register
this server for every agent tool on clone. Keep OAuth tokens in each client's
credential store rather than committing them to the repository.

## Index an existing repository

```sh
agentsam init . --yes --include src,docs
agentsam index plan
agentsam index run
agentsam search "configuration loading"
agentsam repo snapshot --save
```

Choose literal files/directories that actually exist in your repository. Initial indexing
is local AST/text work and makes no embedding calls. Unchanged content is cached; saved
generations retain source provenance. Explicit Gemini embedding requests and Postgres
storage are optional. See [portable knowledge](docs/portable-knowledge.md).

The JavaScript/TypeScript parser records syntactic relationships, not a fully resolved
semantic call graph. Model/dimension changes create a distinct embedding profile.
Python-backed snapshots capture repository composition and Git churn.

## Capability discovery and available kits

The canonical machine-readable capability registry is available through `agentsam capabilities --json`
and `@inneranimalmedia/agentsam-sdk/capabilities`. `agentsam inspect --json` runs the canonical
read-only `repository.snapshot` composition primitive. See [Capabilities and presets](docs/CAPABILITIES.md).

| Capability | Entry point | Guide |
| --- | --- | --- |
| Capability registry + presets | `agentsam capabilities`, `/capabilities`, `/presets` | [Capabilities](docs/CAPABILITIES.md) |
| Portable AgentSam skills | `agentsam skills`; `/skills` | [Skills](skills/README.md) |
| Canonical repository snapshot | `agentsam inspect --json`; `/repository` | [Capabilities](docs/CAPABILITIES.md) |
| Git context and bridge client | `agentsam context --json`; `/git-context`, `/bridge-client` | [Portable context](docs/PORTABLE_CONTEXT.md) |
| Identity contracts and adapters | `/identity`; `agentsam identity init` | [Identity](packages/identity/README.md) |
| Repository knowledge | `agentsam index`, `search`, `repo`; `/knowledge` | [Knowledge](docs/portable-knowledge.md) |
| File integrity | `agentsam merkle`; `/merkle` | [Merkle](docs/MERKLE.md) |
| Security, trust-boundary scan, and repair | `agentsam security`; `/security` | [Security](docs/SECURITY.md) |
| Mini prototypes | `agentsam mini`; `/mini` | [Mini](docs/MINI.md) |
| Recon bounded-worker packets | `agentsam recon pack\|validate` | [Recon](docs/RECON.md) |
| Local containers | `agentsam dockerize`; `/dockerize` | [Dockerize](docs/DOCKERIZE.md) |
| Background indexing service | Docker `knowledge_service`; `/knowledge-service-client` | [Knowledge service](docs/knowledge-service.md) |
| Interactive Agent Sam + resumable local runtime | `agentsam`, `agentsam resume`, `whoami`, `status`, `models`, `start-local` | [CLI shell](docs/CLI_SHELL.md) |

Export suffixes such as `/identity` mean imports from
`@inneranimalmedia/agentsam-sdk/identity`. Use `agentsam <command> --help` where supported.

## AgentSam apps

Reusable, independently runnable products live under `apps/` — currently
`cad-creator` (CAD/robotics engineering station) and `client-cms-editor`
(CMS authoring), with `local-studio` as the hosting Worker. Each declares an
`agentsam.app.json` manifest (id, package name, surfaces, runtime readiness,
and its own `preview`/`info`/`doctor`/`scaffold` commands) and ships its
own `bin/` entry point, so an app is usable standalone via its own binary
(e.g. `agentsam-cad-creator`) or discoverable through the parent CLI:

```sh
agentsam app list
agentsam app info cad-creator
agentsam app doctor cad-creator
agentsam app preview cad-creator
agentsam app scaffold cad-creator ./my-project
```

An app remaining independently runnable/testable/packageable while AgentSam
gives it a uniform discovery surface is the intended shape — not every app is
equally far along yet; `agentsam app info <id>` reports each app's actual
runtime readiness rather than assuming parity.

## MCP client & client adapters

AgentSam manages MCP server connections as the connection authority (`~/.agentsam/mcp/`)
and materializes client configurations for installed editors (Cursor `~/.cursor/mcp.json`,
Claude Desktop config):

```sh
agentsam mcp add inneranimalmedia
agentsam mcp list
agentsam mcp status inneranimalmedia
agentsam mcp doctor inneranimalmedia
agentsam mcp remove inneranimalmedia --client cursor
```

## Live agent evaluation telemetry

Capture real live agent receipts (MCP tool telemetry, git diff, gate verification,
and run metadata) into `agentsam_eval_runs` and `agentsam_model_eval_observations`:

```sh
agentsam eval live start --suite sdk-real-work-20260919 --case cad-shell-unification --client cursor --model "Muse Spark 1.3"
# ... agent executes real work ...
agentsam eval live status
agentsam eval live finish --gate PASS --remote
```

## Optional background service

```sh
agentsam dockerize --type knowledge_service --name agentsam-knowledge \
  --repository app=/absolute/path/to/repository
```

The preset builds a small runtime image, mounts source read-only, exposes an authenticated
localhost job API, and preserves indexes/jobs in a Docker volume. Embeddings are disabled
by default. It uses the same SDK indexing engine; CocoIndex is not a dependency.

The service is a separate deployment target. It does not automatically connect production
Workers, ingest customer repositories, schedule scans, or supply end-user authorization.
The fetch-only `/knowledge-service-client` export can be used by a Worker after the host
authorizes its caller. Other local tooling uses Node APIs.

## Host integration and ownership

Deterministic SDK capabilities remain useful without a model. The installed CLI adds a portable local
runtime for explicit model selection, bounded tool orchestration, secure machine-local credential lookup,
project-scoped execution approvals, provider-neutral resumable sessions, and usage/cost receipts. Those
local records live under the user's AgentSam home state rather than portable repository config.

Production actor/account authorization, shared credential vaults, workflow durability, remote job ownership,
and application records still belong to the consuming host. Git/repository identity never proves actor
authority, and the SDK does not create a second platform tools database. The old `scaffoldProject()` export
is deprecated; use `agentsam create` or the local scaffold commands.

This repository owns portable code once. Applications import it and provide adapters;
they do not mirror SDK trees. [Ownership protocol](protocol/README.md).

## Development and releases

```sh
npm ci
npm run verify:release
```

Release verification runs Node/identity tests, bootstrap and package checks, installed
tarball fixtures in unrelated repositories, Python tests, and a complete dependency scan.
[Development](DEVELOPMENT.md) · [Release receipts](docs/RELEASES.md) ·
[Branch archive](docs/branch-archive-2026-09-02.md).

License: MIT. Optional visual experiments and host-specific integrations retain their
documented boundaries; they are not automatically installed into customer applications.
