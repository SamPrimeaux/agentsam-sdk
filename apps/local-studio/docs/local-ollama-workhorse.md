# Local Ollama workhorse (iMac, not Workers)

Ollama stays on the developer machine at `http://127.0.0.1:11434`. Cloudflare Workers never host the local models and never expose a public Ollama base URL.

```text
Local CLI
  -> 127.0.0.1:11434

Local Studio Worker
  -> EXECOS service binding
  -> target=local + explicit neutral cwd (`/`)
  -> existing AgentSam local execution fabric
  -> 127.0.0.1:11434
```

The canonical Worker entry is `backend/worker/index.js`; the Ollama HTTP routes live in `backend/server/routes/api/llm/` and use the ExecOS-backed runtime adapter in `backend/server/lib/cloudflare-runtime.ts`. `PTY_SERVICE` remains a separate VPC/PTY health lane; model execution stays on `EXECOS`. The Ollama command is filesystem-independent, so its required cwd defaults to portable `/` and can be overridden with `OLLAMA_LOCAL_CWD`.

Default models are `qwen2.5-coder` for chat/code and `mxbai-embed-large` for embeddings.
