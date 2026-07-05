# Agent Sam SDK Execution Spine Map

This branch turns the SDK from a scaffold/router shell into a small, real capability layer without creating a new app.

## Goal

Make the existing `@inneranimalmedia/agentsam-sdk` capable of running boring, typed, inspectable tasks first:

- local project diagnostics
- direct read-only Cloudflare inventory
- shared tool result envelopes
- shared tool execution path
- CLI commands that call SDK tools instead of fake UI state

## Non-goals

- No new app
- No Gorilla UI changes
- No destructive Cloudflare calls
- No dependency on IAM Core for status, doctor, or inventory
- No dashboard rewrite
- No Go or Rust rewrite

## New execution shape

```txt
CLI, app, or future desktop
        ↓
SDK command or SDK method
        ↓
ToolRunner.runTool()
        ↓
real tool implementation
        ↓
ToolResult envelope
```

## Files added

| File | Purpose |
| --- | --- |
| `src/core/ToolResult.js` | Creates normalized success and error envelopes. |
| `src/core/ToolRunner.js` | Registers and runs tools with error normalization. |
| `src/tools/local/doctor.js` | Checks local Node, project, git, wrangler, env, and PTY readiness. |
| `src/tools/cloudflare/client.js` | Minimal direct Cloudflare REST client using local env configuration. |
| `src/tools/cloudflare/inventory.js` | Read-only Cloudflare account inventory scan. |
| `src/commands/status.js` | CLI status and doctor command backed by the doctor tool. |
| `src/commands/cloudflare.js` | CLI Cloudflare inventory command. |

## CLI commands added

```bash
agentsam status
agentsam doctor
agentsam status --json
agentsam cloudflare inventory
agentsam cloudflare inventory --json
```

## Runtime modes

### Local/direct mode

Uses local env vars and local tools. This mode intentionally does not require IAM login.

### IAM Core mode

Existing `agentsam deploy` path remains intact and can still use IAM Core when provisioning is needed.

## Immediate next work

1. Add SDK methods on `AgentSam`, such as `agent.runTool()` and `agent.cloudflare.inventory()`.
2. Add a safe local command runner separate from raw PTY.
3. Add `agentsam logs` against local or cloud telemetry.
4. Add real D1, R2, and Workers subcommands after inventory is stable.
5. Surface the same tools inside the dashboard UI instead of adding UI-only fake actions.

## Rule going forward

If Agent Sam can do it, it should exist as an SDK tool first.
