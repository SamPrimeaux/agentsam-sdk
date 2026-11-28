# MCP development and acceptance

The AgentSam MCP factory supports Cloudflare Worker HTTP, Node HTTP, Node stdio and Python stdio. The Python target depends on the existing optional agentsam-sdk MCP extra. No version bump is needed for source acceptance. Generate with `--python-sdk-source /path/to/agentsam-sdk/python` to use an editable source install before publication; omit the flag once a distribution exposing the MCP API exists.

## Project lifecycle

Use agentsam mcp create NAME --runtime node|python|cloudflare-worker, then mcp validate, inspect, install, test, build or dev from the generated directory. Deploy is Cloudflare-only. Node and Python stdio do not require an account or a Cloudflare deployment.

## Account-owned remote registration

Use agentsam mcp register NAME --url HTTPS_ENDPOINT. Add --write to explicitly request the existing IAM write scope through the CLI's browser sign-in. The command calls the same Studio MCP registry as Settings. Registration creates a disabled entry, not a connected or authorized tool. Complete existing plugin OAuth and tool authorization separately. Do not reuse a resource token or read-only API credential as registry-write authority.

## Native workspace reads

Use the existing account and paired terminal connection. The workspace must be an active account membership with its actual root recorded. Start the existing local runtime from the explicitly chosen folder with agentsam start-local --cwd ROOT. Configure a local MCP client to launch agentsam mcp serve-workspace ROOT --workspace-id ID --connection-id ID.

Each operation rechecks the account credential scopes, account membership, active local terminal connection, user policy, registered tool and allowlist, local paired profile and live root capability. Only read/list/stat are implemented. No terminal or mutation tools are registered. A missing, expired or revoked capability is denied. Browser FSA handles remain browser-origin-bound and are not exported to MCP. Approval- or quota-bound operations fail closed until the execution host can enforce them.

## Acceptance before distribution

Run:
- node --test test/cli/mcp-native-workspace.test.mjs test/cli/mcp-runtime-adapters.test.mjs test/cli/mcp-server-scaffold.test.mjs apps/local-studio/backend/worker/studio-mcps.test.mjs apps/local-studio/backend/worker/studio-mcp-authority.test.mjs apps/local-studio/scripts/studio-agent-settings.test.mjs
- uv run --no-project --python 3.12 --with-editable './python[mcp]' python -m unittest discover -s python/tests -p test_mcp_server.py
- npm run registry:universal:write, npm run docs:registry, node scripts/registry/generate.mjs, then the respective check commands.

After a preview deployment, verify an actual authorized account registration and paired-device workspace read, revoke the allowlist and confirm denial, and visually check the Settings pages at mobile and desktop widths. Do not claim production acceptance from fixture tests or publish distributions before acceptance.

For reviewed local stdio projects, run `agentsam mcp project-tools ./my-server --trust-project` or `agentsam mcp project-call ./my-server --trust-project --tool system.health` after installing dependencies. These are explicit per-command local development sessions, not persisted trust or a filesystem sandbox. Only declared tools can be called; non-read-only tools require the additional write flag. This does not enable a remote catalog entry or grant account workspace access.
