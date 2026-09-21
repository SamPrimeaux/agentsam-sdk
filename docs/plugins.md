# AgentSam plugins

AgentSam plugins are account-scoped installations recorded in the canonical
`agentsam_plugins` row. A plugin owns user-facing connection state and exposes
capabilities through `agentsam_tools`; it does not own raw OAuth tokens.

The first reusable connection is `@agentsam-mcp`:

- `provider_key`: `cloudflare`
- OAuth authority: Cloudflare OAuth (`c0704bd7a7aab7216b362603e1985499`)
- token storage: the consuming Worker’s `agentsam_cloudflare_connections`,
  encrypted with that Worker’s `VAULT_MASTER_KEY`
- tool keys: `agentsam-mcp.docs`, `agentsam-mcp.search`, and
  `agentsam-mcp.execute`

The sandbox package commonly called Code Mode is an execution primitive, not a
connected plugin and not AgentSam’s reasoning loop. The execute tool uses
`dispatch_target = 'codemode'` internally; users connect AgentSam MCP and
never need to install an `@codemode` provider.

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
