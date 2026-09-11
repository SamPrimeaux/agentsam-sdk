# Local Ollama workhorse (iMac, not Workers)

Ollama stays on the iMac (`homebrew.mxcl.ollama` LaunchAgent, `:11434`).
Cloudflare Workers never host `qwen2.5-coder`.

```
iMac ollama serve
  qwen2.5-coder
  mxbai-embed-large
        ↑ tunnel (com.iam.samsmac-tunnel)
Workers
  agentsam-grok-workmode  UI
  agentsam-workmode       /api/vault + D1
```

## CLI (run on the iMac)

```bash
python3 scripts/as_workhorse.py health
python3 scripts/as_workhorse.py ping
python3 scripts/as_workhorse.py tools
python3 scripts/as_workhorse.py packet job --kind pr --cwd .
python3 scripts/as_workhorse.py packet job --kind bindings --cwd .
python3 scripts/as_workhorse.py embed "cms_pages site_id ownership"
```

The model proposes JSON `{action, files, commands, risk, notes}`.
`gh` / `wrangler` stay human-executed (`tools` only probes).

## Worker proxy (later)

See `worker/llm-proxy.stub.js` and `docs/wrangler-llm.snippet.toml`.
Do not merge the stub over `worker/index.js` blindly — it is a route fragment
for `/api/llm/health|chat|embed` after `OLLAMA_BASE_URL` is a tunneled secret.
