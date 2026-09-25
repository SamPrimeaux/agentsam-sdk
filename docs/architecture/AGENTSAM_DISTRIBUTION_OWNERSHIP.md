# AgentSam Distribution, Ownership, and Telemetry Boundaries

## Principle

One AgentSam ecosystem does not mean one giant package, one credential domain, one runtime, or one analytics signal.

Keep these authorities distinct:

- SDK/CLI — umbrella entry point, protocols, orchestration, discovery.
- Products — things users independently install/open, such as Local Studio and CAD Creator.
- Services — independently deployed backends such as agentsam-go-worker.
- Machine runtime — one agentsamd installation per user machine where required.
- InnerAnimalMedia infrastructure — InnerAnimalMedia-owned Cloudflare, D1/R2, Workers, ExecOS, MCP, Tail, VMs.
- Customer/self-host infrastructure — resources owned by the customer's explicitly connected account.

## Normal user vs self-host vs official release

### Normal user

    @inneranimalmedia/agentsam-sdk
              │
              ▼
          AgentSam CLI
          Local Studio
              │
       ┌──────┴─────────┐
       ▼                ▼
    agentsamd      official hosted
    user machine       services

Normal users do not need service source trees or InnerAnimalMedia infrastructure credentials.

### Advanced self-host

    installed @inneranimalmedia/agentsam-go-worker
                    │
                    ▼
            Wrangler identity
                    │
                    ▼
        explicit USER Cloudflare account
                    │
                    ▼
             user's Worker/Container
                    │
                    ▼
             local AgentSam registry

A self-host operation never writes inneranimalmedia-business.

### InnerAnimalMedia official release

    clean maintainer source
             │
             ▼
      explicit InnerAnimalMedia release guard
             │
             ▼
      explicit InnerAnimalMedia CF account
             │
             ▼
    official Worker/Container
             │
        healthy proof
             │
             ▼
    inneranimalmedia-business
    agentsam_products
    asset_relationships

The official registry path is not imported as the default meaning of deploy.

## Cloudflare identity boundary

Wrangler is the deploy authority. AgentSam uses wrangler whoami --json, requires an authenticated account, requires explicit selection when multiple accounts are available, binds the chosen account into the child process, and records only non-secret account metadata in receipts.

Distributed packages never include InnerAnimalMedia Cloudflare credentials.

## Repository/package boundary

@inneranimalmedia/agentsam-sdk remains the umbrella package. Deployable or independently installable products/services can be their own packages.

The Go service is:

    @inneranimalmedia/agentsam-go-worker

The SDK discovers that package instead of assuming:

    <sdk install>/apps/agentsam-go-worker

This lets a normal SDK tarball remain focused while preserving a single AgentSam user experience.

## Local state boundary

Installed packages are source artifacts, not mutable user state.

Use:

    <caller>/.agentsam/

for build/deploy receipts, local product projections, and transient proof artifacts.

Do not write runtime state into:

    node_modules/@inneranimalmedia/...

## Product/runtime boundary

User-facing products should declare runtime requirements rather than bundle complete daemons.

    Local Studio ──┐
    CAD Creator ───┼──► one agentsamd ─► capability inventory
    Ecommerce ─────┘

Hosted services such as agentsam-go-worker remain services. agentsamd remains the user-machine execution runtime.

## Distribution analytics: keep funnel stages separate

Do not turn package installation into hidden database access.

Measure distinct signals:

    DISCOVERY
      npm aggregate downloads
      docs/site interest
          ↓
    ACTIVATION
      AgentSam first run
      Local Studio opened
      agentsamd booted
          ↓
    ADOPTION
      products/apps enabled
      repositories registered
          ↓
    VALUE
      successful runs
      packages/deployments verified
          ↓
    RETENTION
      returning active installations/accounts/projects
          ↓
    INFRA HEALTH
      Workers
      Go runtime
      ExecOS
      agentsamd
      MCP

Npm download counts are distribution metrics, not unique-user counts.

Do not add a postinstall phone-home path. First-run/product telemetry should be disclosed/configurable and constrained to product facts. Do not collect home directories, working paths, repository names, git remotes, hostnames, usernames, command contents, credentials, or environment variables as activation telemetry.

If an anonymous installation identifier is used, generate a random local UUID; never derive it from hardware identifiers.

## Telemetry authorities

Use separate authorities:

- npm/registry data — aggregate package distribution.
- AgentSam analytics ingestion service — validated activation/adoption/value events.
- inneranimalmedia-tail — InnerAnimalMedia runtime/Worker observability where Cloudflare Tail is the appropriate primitive.

Do not make inneranimalmedia-tail the install counter. Treat it as a registered infrastructure primitive in SAM's topology and assign it runtime-observability responsibilities deliberately.

A future analytics ingestion path can normalize events from CLI, Local Studio, agentsamd, hosted services, npm metric collectors, and Tail into aggregate analytics without granting distributed clients direct D1 access.

## Scale objective

The purpose is not to collapse dozens of repositories and Workers into one monolith.

The objective is to give every asset a known identity, capabilities, dependencies, health state, deployment receipt, ownership boundary, and protocol relationship so SAM can operate a large software estate systematically.

Protect this rule:

One authority per concept; multiple implementations/adapters where appropriate.
