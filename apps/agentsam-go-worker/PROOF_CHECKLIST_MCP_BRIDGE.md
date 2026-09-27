# MCP Bridge — Proof Checklist

This is generated boilerplate, not proof it works. Do not mark this "shipped"
until every step below has actually been run and shows real output.

## 1. Registry loads all 6 example tools

Wire a tiny main.go (or a `go test`) that calls `LoadRegistry("tools")` and
prints `len(reg.Tools)` plus any returned errors.

Expected: 6 tools loaded (echo_go, echo_rust, echo_python, echo_node, echo_ts,
echo_http), zero errors.

## 2. Each adapter round-trips for real, one at a time

Run the exact stdin/stdout contract by hand first (bypassing agentsamd), to
isolate adapter bugs from dispatcher bugs:

```
echo '{"tool":"echo_python","arguments":{"text":"hello"}}' | python3 tools/echo-python/adapter.py
echo '{"tool":"echo_node","arguments":{"text":"hello"}}'   | node tools/echo-node/adapter.js
echo '{"tool":"echo_ts","arguments":{"text":"hello"}}'     | npx tsx tools/echo-ts/adapter.ts
echo '{"tool":"echo_go","arguments":{"text":"hello"}}'     | (cd tools/echo-go && go run adapter.go)
echo '{"tool":"echo_rust","arguments":{"text":"hello"}}'   | (cd tools/echo-rust && cargo run --quiet)
```

Every line must print exactly one JSON object with `"ok": true` and
`"result": {"text": "hello", "via": "<language>"}`.

## 3. HTTP adapter, separately

```
python3 tools/echo-http/server.py &
curl -s -X POST http://127.0.0.1:8901/call -d '{"tool":"echo_http","arguments":{"text":"hello"}}'
kill %1
```

Must return `{"ok": true, "result": {"text": "hello", "via": "http"}}`.

## 4. Through agentsamd itself, end to end

Wire `bridge.go`'s `CallTool`/`ListTools` into agentsamd's actual MCP-facing
handler (wherever `tools/list` and `tools/call` JSON-RPC methods are currently
routed). Then, with agentsamd running, call each of the 6 tools THROUGH
agentsamd, not by invoking adapters directly.

Every one of the 6 must succeed through the real daemon path, not just
standalone. This is the actual proof — steps 1-3 only isolate where a failure
lives if step 4 fails.

## 5. Remove the examples once real tools exist

`echo-*` are proof-of-contract scaffolding, not shipped tools. Delete
`tools/echo-*` once at least one real, useful tool (filesystem read, process
list, whatever the actual product need is) is built and proven the same way.
