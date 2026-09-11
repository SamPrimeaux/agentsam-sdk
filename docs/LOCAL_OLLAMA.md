# Local Ollama development kit

AgentSam supports Ollama as an **opt-in local development runtime**. Ollama stays on the developer's machine; the `agentsam-sdk` Cloudflare Worker does not receive an Ollama binding and does not run an Ollama model at the edge.

Canonical local defaults:

```text
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder
OLLAMA_EMBED_MODEL=mxbai-embed-large
```

## Setup

```sh
agentsam ollama setup
```

That writes the three values into the current project's `.env` and, when `.agentsam/config.json` exists, records a non-secret `local_model` capability there. It does **not** silently install software or download models.

Explicit opt-ins are available:

```sh
agentsam ollama setup --install
agentsam ollama setup --start
agentsam ollama setup --pull
agentsam ollama setup --install --start --pull
```

Automatic installation uses Homebrew on macOS/Linux when available, or `winget` on Windows. Hosts without a supported local package manager receive a clear manual-install message instead of running an opaque remote install script.

Model management:

```sh
agentsam ollama status
agentsam ollama list
agentsam ollama pull
agentsam ollama pull qwen2.5-coder
```

`ollama pull` with no model pulls the configured chat and embedding models.

## Local tunnel boundary

For a remote AgentSam session, use the existing **user-hosted terminal tunnel** to execute `agentsam ollama ...` on the user's machine. The local CLI then reaches `127.0.0.1:11434` from that machine.

```text
remote agent
    │
    │ existing terminal tunnel
    ▼
local AgentSam CLI
    │
    └── http://127.0.0.1:11434
         local Ollama process
```

This avoids exposing Ollama's HTTP API to the public internet and avoids pretending that a Cloudflare Worker can reach the developer's loopback interface. A deliberately configured HTTP tunnel can still be supplied with `--base-url`, but it is not the default product path.
