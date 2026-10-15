# AgentSam SDK: real MCP D1 tools, existing authority

## Problem
The IAM MCP server already exports agentsam_cf_d1_list, agentsam_d1_query,
agentsam_d1_write and agentsam_d1_delete. ChatGPT with a connected MCP session
can execute those against actual Cloudflare D1 accounts. The standalone SDK
agent did not bind these operations at all; it only had a narrower, separate
Wrangler schema inspector.

## Implementation
This slice adds the existing MCP operation names to the canonical SDK
capability manifest/registry and binds them to the existing
src/mcp/client.js MCP JSON-RPC callMcpTool implementation. MCP credentials
and SQL policy stay entirely in the connected server's existing identity,
OAuth, workspace, and D1 tool implementations.

createMcpD1Bridge({invokeTool}) supports authenticated external hosts
(e.g. Local Studio / ChatGPT MCP) injecting their actual MCP transport.
The CLI path resolves a configured, authenticated inneranimalmedia
server entry from the SDK's existing ~/.agentsam/mcp authority. It does
not invent credentials or steal tokens from another app. If no local MCP
configuration exists, these operations are discoverable but unavailable,
not falsely offered to the LLM.

A database UUID must be selected by list results. The bridge does not guess
targets from project names, mirror remote rows into local SQLite, or perform
any unapproved mutations. Read and write operations use the established
authorizeCapability / beforeTool host approval boundaries, and the MCP
server separately enforces its own role and SQL restrictions. The SDK only
validates bounded argument shapes and limits model-return sizes.

## Acceptance and current limits
- Live MCP agentsam_cf_d1_list and agentsam_d1_query: verified via the
  user-authorized ChatGPT host against FuelNFreetime D1, 0 rows written.
- SDK: registry/adapter/serialized model-turn tests verify discovery,
  actual MCP operation names, result consumption, and write approval rejection.
- A standalone local CLI process has no MCP server entry installed in the
  current ~/.agentsam/mcp authority. ChatGPT's hosted connected-app session
  is not automatically available inside the CLI. Until a local MCP session is
  installed or the host injects its authorized transport, the CLI correctly
  reports mcp_d1_connection_not_configured and cannot read remote D1.
- This slice does not change Cloudflare OAuth grants, add a database executor,
  create a Plan/knowledge store, or alter remote production D1 data.

Test:
  npm run verify:registry
  node --test test/registry/mcp-d1-bridge.test.mjs
