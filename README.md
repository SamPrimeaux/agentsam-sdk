# AgentSam SDK

A deterministic-first application and agent toolkit: reusable repository, knowledge, integrity,
security, identity, scaffolding, and delivery capabilities with optional AgentSam/LLM composition.
CLI/TUI surfaces make those same primitives easy to use without making a model part of the implementation.

**npm:** `@inneranimalmedia/agentsam-sdk` · **Source:** [GitHub](https://github.com/SamPrimeaux/agentsam-sdk)

Node 22.5+ is required. Docker is optional for container commands. Python 3.10+ is required
for the bundled Python repository tools; Rich is optional for the richer terminal UI.
See the [2.0 release guide](docs/sdk-2.0-release.md) for publication status and migration notes.

## Install

```sh
npm install @inneranimalmedia/agentsam-sdk
# Or install the CLI globally:
npm install -g @inneranimalmedia/agentsam-sdk
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

Without a global install, use `npx @inneranimalmedia/agentsam-sdk create my-agent --preset fullstack`.

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
| Canonical repository snapshot | `agentsam inspect --json`; `/repository` | [Capabilities](docs/CAPABILITIES.md) |
| Git context and bridge client | `agentsam context --json`; `/git-context`, `/bridge-client` | [Portable context](docs/PORTABLE_CONTEXT.md) |
| Identity contracts and adapters | `/identity`; `agentsam identity init` | [Identity](packages/identity/README.md) |
| Repository knowledge | `agentsam index`, `search`, `repo`; `/knowledge` | [Knowledge](docs/portable-knowledge.md) |
| File integrity | `agentsam merkle`; `/merkle` | [Merkle](docs/MERKLE.md) |
| Dependency health and repair | `agentsam security`; `/security` | [Security](docs/SECURITY.md) |
| Mini prototypes | `agentsam mini`; `/mini` | [Mini](docs/MINI.md) |
| Recon bounded-worker packets | `agentsam recon pack\|validate` | [Recon](docs/RECON.md) |
| Local containers | `agentsam dockerize`; `/dockerize` | [Dockerize](docs/DOCKERIZE.md) |
| Background indexing service | Docker `knowledge_service`; `/knowledge-service-client` | [Knowledge service](docs/knowledge-service.md) |
| Local status, DB, terminal UI | `agentsam status`, `db`, `tui`, `start-local` | [Terminal UI](docs/CLI_SHELL.md) |

Export suffixes such as `/identity` mean imports from
`@inneranimalmedia/agentsam-sdk/identity`. Use `agentsam <command> --help` where supported.

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

The root `AgentSam` helper supplies routing/session primitives. Full model orchestration,
tool execution policy, provider credentials, user authorization, and production storage
belong to the consuming host application. The npm package alone does not provide a hosted
autonomous agent platform. The old `scaffoldProject()` export is deprecated; use the local
CLI scaffold command.

This repository owns portable code once. Applications import it and provide adapters;
they do not mirror SDK trees. [Ownership protocol](protocol/README.md).

## Development and releases

```sh
npm ci
npm run verify:release
```

Release verification runs Node/identity tests, bootstrap and package checks, installed
tarball fixtures in unrelated repositories, Python tests, and a complete dependency scan.
[Development](DEVELOPMENT.md) · [Release guide](docs/sdk-2.0-release.md) ·
[Branch archive](docs/branch-archive-2026-09-02.md).

License: MIT. Optional visual experiments and host-specific integrations retain their
documented boundaries; they are not automatically installed into customer applications.
