# agentsamd MCP Bridge — Adapter Contract

`agentsamd` speaks MCP (`tools/list`, `tools/call`) to the outside world.
It does NOT execute tool logic itself — it dispatches to adapters, one
directory per tool under `runtime/mcp-bridge/tools/<tool-name>/`.

Each tool directory has a `tool.json` manifest:

```json
{
  "name": "echo",
  "description": "Echoes back whatever you send it.",
  "protocol": "stdio-json",
  "command": ["python3", "adapter.py"],
  "input_schema": {
    "type": "object",
    "properties": { "text": { "type": "string" } },
    "required": ["text"]
  }
}
```

## protocol: "stdio-json"  (any language — Go, Rust, Python, Node, TS, whatever)

agentsamd spawns `command` (cwd = the tool's own directory), writes ONE
JSON line to stdin:

```json
{"tool": "echo", "arguments": {"text": "hi"}}
```

...and reads ONE JSON line back from stdout before the process exits:

```json
{"ok": true, "result": {"text": "hi"}}
```

or on failure:

```json
{"ok": false, "error": "human-readable reason"}
```

Nothing else touches stdout. Logs/debug output go to stderr only.
Exit code is ignored — the JSON `ok` field is the source of truth.

## protocol: "http"  (adapter is already a long-running local server)

`tool.json` has a `"url"` field instead of `"command"` (e.g.
`"url": "http://127.0.0.1:8901/call"`). agentsamd POSTs the same
`{"tool": ..., "arguments": ...}` body and expects the same
`{"ok": ..., "result"|"error": ...}` shape back. Use this when the tool
needs to stay warm (e.g. a loaded model, an open DB connection) instead
of paying process-spawn cost per call.

## Adding a new tool

1. `mkdir runtime/mcp-bridge/tools/<your-tool>`
2. Write `tool.json` + your implementation, any language, either protocol.
3. `registry.go` auto-discovers it on next agentsamd start — no code change
   needed in the dispatcher itself.
