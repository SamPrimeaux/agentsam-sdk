# AgentSam setup and capability installation

**Status:** implemented CLI surface; host-dependent execution and verification.  
**Authority:** `src/commands/setup.js`, `src/lib/setup/{contract,recipes,planner,execute,runtime}.js`.  
**Related:** [Capability registry](../CAPABILITIES.md) · [Application contract](../architecture/AGENTSAM_APPLICATION_CONTRACT.md) · [Distribution ownership](../architecture/AGENTSAM_DISTRIBUTION_OWNERSHIP.md).

AgentSam **orchestrates** prerequisite installation; Homebrew, apt, winget, npm, or a documented manual provider performs the package installation. `agentsam setup` does **not** install an AgentSam product/app, provision a customer's cloud account, connect an OAuth identity, or make every declared capability executable.

## Two setup lanes

| Lane | Command | Owns | Evidence |
| --- | --- | --- | --- |
| Toolchain prerequisites | `agentsam setup [capability-id]` | Detect → plan → explain → approve → native package install → verify | `~/.agentsam/receipts/setup-*.json` when execution is attempted |
| Execution runtime | `agentsam setup runtime [--profile id]` | Detect host → profile selection → constraint/GOAP plan → optional `agentsamd` adapter installation/reuse | `~/.agentsam/runtime/` plan and installation receipts |

For the **toolchain** lane, the contract is:

```text
DISCOVER → PLAN → EXPLAIN → APPROVE → EXECUTE (native provider) → VERIFY → RECEIPT
```

A `--dry-run` produces a plan without package mutations. `--yes` supplies noninteractive approval **for the displayed setup plan only**, not blanket approval for credentials, paid APIs, account provisioning, remote D1 writes, or application installation. Changes outside the declared recipe require a separate authorized workflow.

### Toolchain commands

```bash
agentsam setup --list
agentsam setup --list --json
agentsam setup --dry-run
agentsam setup image.vectorize --dry-run
agentsam setup image.vectorize             # asks before required package installation
agentsam setup image.vectorize --yes       # noninteractive plan approval
agentsam setup google.cloud --inventory    # read-only provider inventory
agentsam setup google.cloud --dry-run
agentsam setup cloudflare.wrangler --dry-run
agentsam setup image.raster.transform --dry-run
```

These are the **four** registered recipes in `src/lib/setup/recipes.js` at this revision:

| Recipe ID | Detects | Planned provider / primary dependency | What it does *not* do |
| --- | --- | --- | --- |
| `image.raster.transform` | Sharp or ImageMagick | npm `sharp` (preferred) | It does not mean every image/brand capability is installed |
| `image.vectorize` | Potrace, with optional ImageMagick detection | macOS Homebrew `potrace`; Linux apt `potrace`; Windows installer guidance | ImageMagick and SVGO are optional, not mandatory vectorization dependencies |
| `google.cloud` | `gcloud` CLI | macOS Google Cloud SDK cask; Windows winget; Linux documented manual install | It does not log in, grant scopes, select projects, or enable billing/APIs |
| `cloudflare.wrangler` | `wrangler` on PATH | npm `wrangler@latest` | It does not authenticate or deploy into any Cloudflare account |

The selected recipe contains `id`, `displayName`, `description`, `detect()`, `supportedPlatforms`, platform `installPlans`, `dependencies`, `mutations`, `risk`, `requiresApproval`, `verify()`, `uninstallHint()`, and `capabilityProvided`. `capabilityProvided` describes tooling enabled by a recipe; it is **not** a claim of a bound AgentSam agent tool.

Only providers supported by the selected platform plan can execute. A missing plan, unknown recipe, provider failure, or failed verification must be reported, not called installed. `--list` reports recipes, not the entire protocol capability manifest.

## Runtime profiles: planning vs actual installation

```bash
agentsam setup runtime --list
agentsam setup runtime --dry-run
agentsam setup runtime --profile my_computer --dry-run
agentsam setup runtime --profile my_computer --yes
agentsam runtime doctor --json
```

The runtime planner currently models `my_computer`, `isolated_local`, `cloud_computer`, `on_demand`, and `safe_sandbox`. These are **goal profiles**, not five verified installed/deployed products.

`agentsam setup runtime` persists a plan receipt. With `--yes`, the current code can install, restart, or reuse a healthy local `agentsamd` adapter for an eligible profile. **GOAP steps beyond that adapter remain `planned_only`** in the receipt: planning an instance, connection, transport, enrollment or health probe is not proof that those actions occurred. Inspect actual runtime state and host receipts before claiming readiness. This command does not automatically provision Cloudflare/GCP resources from a profile description.

## Provider identity and inventory

```bash
agentsam setup google.cloud --inventory
agentsam gcloud auth login
agentsam google-cloud connection set --identity EMAIL --project PROJECT
agentsam google-cloud doctor --json
```

The `--inventory` path reads the CLI's accessible auth accounts, active account/config, token scopes, visible projects, billing accounts, and IAM roles for the active user, with explicit errors when permissions prevent reads. It does not create accounts or grant scopes. Desktop/hosted Google OAuth and `gcloud --sdk` remain distinct authentication paths; see [Google Cloud OAuth setup](google-cloud-oauth-setup.md).

## Setup is not product or plugin installation

| Action | Source of truth | Result |
| --- | --- | --- |
| `agentsam setup …` | Setup recipe registry | Native prerequisite packages + local setup receipt |
| `agentsam runtime install` | `agentsamd` runtime installer | User-machine execution runtime |
| `agentsam capabilities …` | `protocol/capabilities/manifest.json` joined with command/package registry | Declared capabilities and *separately verified* handler status |
| `agentsam app list/inspect/validate` | `agentsam.app.json` | Discover/inspect/validate source-distributed product manifests; **not** an account installation |
| `agentsam plugins` / Local Studio plugin gallery | Plugin catalog + account installation/connection records | Plugin registration/connection lifecycle; a catalog record is not a working tool |

Build-time `included_apps` / `embed` determine what ships **inside one build**, not what a user installs later. A runtime APP install needs a durable, account/host-scoped installation record and verified launch/permission path. Do not document manifest bundling, CLI discovery, or npm package existence as a completed post-download product-install workflow.

## Trust boundary and failure follow-through

Never silently install packages, trust third-party taps, modify shell profiles, connect accounts, mutate credentials, enable paid cloud services, change cloud resources, or reuse the operator's credentials for a customer. Show proposed changes and the exact approval boundary.

On missing tooling: identify the requested capability and provider, show what was detected, present `agentsam setup <recipe> --dry-run` when a recipe exists, and otherwise say no recipe exists. On a declared but unavailable agent capability, use `agentsam capabilities <id> --json` and host registry `capability.status`; do not substitute a different database, execution runtime, or account.

**Product standard:** a successful setup recipe proves its dependency, not a shipped customer journey. See [Delivery closure](../standards/DELIVERY_CLOSURE.md).
