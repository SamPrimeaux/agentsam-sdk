# AgentSam plugins

AgentSam plugins are account-scoped installations recorded in the canonical
`agentsam_plugins` row. A plugin owns user-facing connection state and exposes
capabilities through `agentsam_tools`; it does not own raw OAuth tokens.

The first reusable connection is `@agentsam-mcp`:

- `provider_key`: `cloudflare`
- OAuth authority: Cloudflare OAuth (`c0704bd7a7aab7216b362603e1985499`)
- token storage: the consuming Worker’s `user_oauth_tokens`
  (`provider=cloudflare`), sealed with that Worker’s `VAULT_MASTER_KEY`
- tool keys: `agentsam-mcp.docs`, `agentsam-mcp.search`, and
  `agentsam-mcp.execute`

The sandbox package commonly called Code Mode is an execution primitive, not a
connected plugin and not AgentSam’s reasoning loop. The execute tool uses
`dispatch_target = 'codemode'` internally; users connect AgentSam MCP and
never need to install an `@codemode` provider.

`inneranimalmedia-cf-oauth` is a separate, host-owned confidential Cloudflare
OAuth installation for Inner Animal Media Platform. It uses
`https://inneranimalmedia.com/api/oauth/cloudflare/start` and its callback is
`https://inneranimalmedia.com/api/oauth/cloudflare/callback`. It is not a
replacement for Local Studio's PKCE `agentsam-mcp` installation and has no
SDK-dispatched tool rows.

Install the portable D1 contract and local plugin manifest in an application:

```sh
agentsam plugins install @agentsam-mcp
```

That writes `.agentsam/plugins.json` and copies
`migrations/d1/0001_agentsam_plugin_runtime.sql`. The consuming application
then materializes its account row with `installPlugin()` and records real
probes in `agentsam_plugin_health_checks`. `agentsam_plugins.health_status` is
only the materialized latest result.

`@inneranimalmedia-mcp-server` is a separate IAM-authorized MCP service at
`https://mcp.inneranimalmedia.com/mcp` with client
`iam_mcp_inneranimalmedia`. It must not be conflated with the Cloudflare OAuth
client used by `@agentsam-mcp`.

## Browser MCP — local Chrome extension

Browser MCP is an additional **device-local** plugin. It does not use the
Cloudflare Worker as a browser proxy and does not ask users to export Chrome
cookies, credentials, or the Browser MCP daemon token. Browser MCP's own
daemon and Chrome extension enforce the six-digit pairing step.

On the machine running AgentSam (Node.js 20+; the SDK itself requires Node 22+):

```sh
agentsam plugins install @browsermcp
agentsam plugins connect @browsermcp --client agentsam
agentsam mcp doctor browsermcp --json
agentsam mcp tools browsermcp --json
```

The local MCP authority is `~/.agentsam/mcp/browsermcp.json`; the
independent AgentSam-app adapter is `~/.agentsam/mcp.json`.
You can also use `agentsam mcp add browsermcp --client cursor` or
`--client claude` to sync the documented **stdio** configuration to those
local applications without overwriting unrelated servers.

The CLI starts `npx @browsermcp/mcp@latest` and uses the official
`@modelcontextprotocol/sdk` stdio client to initialize, list, and call real
tools. It only accepts this reviewed Browser MCP executable and arguments.
It will never execute a local program supplied by a remote catalog.

After starting the server, open the **Browser MCP Chrome extension**, verify
that its six-digit code matches the code in the agent's response, and click
**Allow**. This is a user-controlled security boundary. Do not approve a
mismatched or unexpected code.

To exercise the tool after pairing:

```sh
agentsam mcp call browsermcp --tool browser \
  --input '{"commands":"goto https://browsermcp.io\nget title"}' --json
```

Tool discovery or successful MCP initialization **does not prove the Chrome
extension is paired**. The plugin reports pairing as unverified until an
actual authorized browser command succeeds. Account registration alone
does not create executable D1 tool rows: tools are discovered from the live
local MCP session.

**Host boundary:** the browser integration works only inside a supported
local CLI/desktop agent host. Hosted Cloudflare Workers and ChatGPT remote
connectors cannot start the user-device stdio process, and are deliberately
refused as execution destinations. A separate, authenticated device bridge
would be required before a hosted Studio chat could invoke this MCP server.

Sources: https://browsermcp.io/docs/ai-apps and
https://browsermcp.io/docs/how-it-works
