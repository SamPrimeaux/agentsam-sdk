# AgentSam Registry / CLI / Agent Parity (incremental v1)

The root @inneranimalmedia/agentsam-sdk is the canonical agent harness product.
bin/agentsam remains the thin executable entry. src/ owns the model loop,
CLI interfaces, registry and binding adapters. packages/ exports reusable
capability implementations; apps/ consume the harness instead of forking it.

This first integration is intentionally NOT a full CLI-to-agent conversion.

## Inventory ownership

- src/cli/command-catalog.js: canonical human CLI command descriptions.
- protocol/capabilities/manifest.json: canonical declarations, schema and effects.
- src/agent/capability-adapter.js: concrete invokable handler bindings.
- packages/*/agentsam.package.json and two extra workspace package manifests:
  package product descriptions, install metadata and authored classifications.
- src/registry/index.js: pure joined view over those authorities (not a second
  command dispatcher).
- scripts/registry/generate.mjs: deterministic generated registry with command
  usage and package use_when values derived from actual descriptions or mapped
  capability commands. Unproven runtime statuses stay unverified.
- agentsam.yaml packages.inventory and cli.commands: generated; hand-curated
  root package configuration under packages remains intact.

Existing user-facing commands:

    agentsam capabilities
    agentsam capabilities --inventory --json
    agentsam capabilities --inventory --commands --search machine
    agentsam capabilities --inventory --packages --search workbench
    agentsam explain command machine
    agentsam explain package agentsam-local-shared
    agentsam explain capability workspace.write

No new agentsam catalog command exists.

## Agent discovery

The CLI agent capability adapter now exposes:
- capability.search
- capability.describe
- capability.status
- capability.invoke

invoke requires an actual bound handler, a first-family allowlist, and a host
authorization callback. Unbound and unavailable tools return an explicit reason.
The outer model loop still controls tool-call approval and run budgets.

First bound families: repository.snapshot, knowledge.search, machine.inspect
(only advertised when native resolution exists), workspace.read, workspace.write,
terminal.exec, test.run. Other declared capabilities may be executable via
existing handlers but are not universally mapped from all CLI commands.

Filesystem read/write roots are supplied by the host, never selected from the
active terminal tab. Relative paths remain under the real project root;
protected .git, node_modules and environment files are excluded. Updating an
existing file requires its expected SHA-256. Write/test/terminal operations
remain approval-requiring; terminal commands execute with the project root
supplied by the host.

This does not claim that the host is a sandbox against an approved subprocess.
Operator execution permissions are still a trust boundary.

## CLI error work

The error package exports usageError / processError / renderCliError, preserving
the canonical error catalog, context and exit status.

- Usage errors: exit 2.
- Runtime execution failures: exit 1.
- Local human errors do not claim HTTP 500.
- JSON output retains the canonical envelope and redacted CLI context.
- Machine command migrated first.
- Bare agentsam rust now prints guidance.
- Root --help dispatches without launching commands.
- The outer cli.js boundary catches previously unwrapped throws.

The plain-command-Error count is a **legacy debt baseline**. CI blocks new
instances per file but does not claim that every command has been converted.
Continue with rust, setup, status, resume, credentials, models and deploy.

Generated error vocabulary reference:
docs/reference/AGENTSAM-ERROR-REASONS.md.

## Turn-one context audit

CLI operator opt-in only (absolute destination path, private 0600, one-shot):

    AGENTSAM_TURN1_AUDIT_FILE=/tmp/agentsam-cli-turn-one.json agentsam

When a model turn actually runs, its **pre-provider-adapter** input, system
instructions, selected tool schemas and context receipt are saved. These may
contain private or credential-like text. Never commit or upload these dumps.

Local Studio streamChat now supports onPreparedTurn(payload), which receives
the exact outbound message list to the local provider bridge or hosted chat API.
It is not yet connected to an interactive debug UI or persisted desktop audit
artifact. The hosted API and provider adapter may further transform messages;
the capture is NOT proof of exact provider-native wire bytes.

After capturing local files explicitly, use:

    node scripts/registry/compare-turn-one.mjs /tmp/cli.json /tmp/studio.json

The comparator reports message roles, tool names, schema sizes and context
character counts without dumping full prompt text in its output. The actual
pre-provider capture remains in the two source files.

For simple, unambiguously general knowledge questions, the CLI runner does not
build a repository card or hydrate tools. More specific project-related prompts
retain contextual perception. Local Studio's corresponding context discipline
comes from its separate stream/chat policy; unify the runners next.

## Verification

    npm run verify:registry
    npm --prefix packages/agentsam-errors test

CI checks catalog and generated-file drift, first-family agent handler binding,
CLI help/usage behavior, errors and workspace path protection.

## Not yet READY / follow-up work

- Local Studio still streams text through its separate provider path. It must
  consume the same canonical tool execution and event/receipt runtime before
  desktop agent parity can be claimed.
- Actual CLI-vs-Local Studio model calls have not yet been captured and compared.
- Full provider-native wire tracing requires the host adapter boundary.
- All CLI command errors are not yet typed; see the plain-error baseline.
- Remaining CLI command usage, avoid_when and package classification data
  should be classified only when source-backed, never inferred as verified.
- Build automated fixtures for real Machine inspection, authorized file
  write, test runner and packaged macOS app invocation before READY.
