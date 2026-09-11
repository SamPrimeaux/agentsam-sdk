#!/usr/bin/env python3
"""
AgentSam local workhorse
========================
Runs on the iMac next to `ollama serve` (LaunchAgent homebrew.mxcl.ollama).

Does NOT run models on Cloudflare Workers. Workers only proxy later.

Usage:
  python3 as_workhorse.py health
  python3 as_workhorse.py ping
  python3 as_workhorse.py tools
  python3 as_workhorse.py chat "summarize this diff"
  python3 as_workhorse.py packet job --kind pr --cwd /path/to/repo
  python3 as_workhorse.py packet job --kind bindings --cwd /path/to/repo
  python3 as_workhorse.py packet job --kind census --cwd /path/to/repo
  python3 as_workhorse.py embed "cms_pages site_id ownership"
  python3 as_workhorse.py index-dir --cwd /path/to/repo --glob "*.toml,*.md,wrangler*"
  python3 as_workhorse.py search --cwd /path/to/repo "who owns cms_pages"
  python3 as_workhorse.py emit-worker-stub
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

OLLAMA = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
CHAT_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5-coder")
EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "mxbai-embed-large")
TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT", "180"))

SYSTEM_LAW = """You only see a compressed packet. Return JSON only with keys:
action, files, commands, risk, notes.
action is one of: propose, need_more, refuse.
files is an array of {path, intent, patch_hint}.
commands is an array of exact shell commands the HUMAN may run (gh, wrangler, git).
risk is low|medium|high.
notes is a short string.
Never invent wrangler bindings that are not in the packet.
Never dump a repository.
Never claim you executed gh or wrangler — you only propose.
"""

JOBS = ("pr", "bindings", "census", "generic")


def http_json(method: str, url: str, payload: dict[str, Any] | None = None) -> Any:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"content-type": "application/json", "accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code} {url}\n{body}") from e
    except urllib.error.URLError as e:
        raise SystemExit(
            f"Cannot reach Ollama at {url}\n{e}\n"
            "Is homebrew.mxcl.ollama running?  launchctl print gui/$(id -u)/homebrew.mxcl.ollama"
        ) from e


def run(cmd: list[str], cwd: Path | None = None, timeout: int = 30) -> dict[str, Any]:
    if not shutil.which(cmd[0]) and cmd[0] not in ("git",):
        return {"ok": False, "cmd": cmd, "error": f"{cmd[0]} not on PATH"}
    try:
        p = subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "ok": p.returncode == 0,
            "cmd": cmd,
            "code": p.returncode,
            "stdout": (p.stdout or "")[:8000],
            "stderr": (p.stderr or "")[:2000],
        }
    except FileNotFoundError:
        return {"ok": False, "cmd": cmd, "error": f"{cmd[0]} not found"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "cmd": cmd, "error": "timeout"}


def cmd_health(_: argparse.Namespace) -> int:
    tags = http_json("GET", f"{OLLAMA}/api/tags")
    names = [m.get("name") for m in tags.get("models", [])]
    print(json.dumps({
        "ollama": OLLAMA,
        "ok": True,
        "models": names,
        "have_chat": any(CHAT_MODEL in (n or "") for n in names),
        "have_embed": any(EMBED_MODEL in (n or "") for n in names),
        "want_chat": CHAT_MODEL,
        "want_embed": EMBED_MODEL,
    }, indent=2))
    return 0


def cmd_ping(_: argparse.Namespace) -> int:
    out = http_json("POST", f"{OLLAMA}/api/generate", {
        "model": CHAT_MODEL,
        "prompt": "Reply with only: ollama-ok",
        "stream": False,
    })
    text = (out.get("response") or "").strip()
    print(json.dumps({"ok": "ollama-ok" in text.lower() or "ok" in text.lower(), "response": text}, indent=2))
    return 0


def cmd_tools(_: argparse.Namespace) -> int:
    report = {
        "gh_user": run(["gh", "api", "user"]),
        "gh_repo": run(["gh", "repo", "view", "SamPrimeaux/AgentSam-Grok-Workmode"]),
        "wrangler_whoami": run(["npx", "--yes", "wrangler", "whoami"]),
        "wrangler_ui": run([
            "npx", "--yes", "wrangler", "deployments", "list",
            "--name", "agentsam-grok-workmode",
        ]),
        "git": run(["git", "rev-parse", "--show-toplevel"]),
    }
    slim = {}
    for k, v in report.items():
        slim[k] = {
            "ok": v.get("ok"),
            "preview": (v.get("stdout") or v.get("error") or v.get("stderr") or "")[:500],
        }
    print(json.dumps(slim, indent=2))
    return 0


def chat(system: str, user: str) -> str:
    out = http_json("POST", f"{OLLAMA}/api/chat", {
        "model": CHAT_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    })
    return (out.get("message") or {}).get("content") or out.get("response") or ""


def parse_model_json(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
    return {"action": "need_more", "files": [], "commands": [], "risk": "low", "notes": text[:1500]}


def collect_pr_packet(cwd: Path) -> str:
    st = run(["git", "status", "--short"], cwd)
    diffstat = run(["git", "diff", "--stat", "HEAD"], cwd)
    names = run(["git", "diff", "--name-only", "HEAD"], cwd)
    files = [ln.strip() for ln in (names.get("stdout") or "").splitlines() if ln.strip()][:8]
    snippets = []
    for rel in files[:3]:
        p = cwd / rel
        if p.is_file() and p.stat().st_size < 80_000:
            body = p.read_text(errors="replace")[:2500]
            snippets.append(f"--- {rel} ---\n{body}")
    return (
        f"JOB=pr\nREPO={cwd}\n"
        f"STATUS:\n{st.get('stdout')}\n"
        f"DIFFSTAT:\n{diffstat.get('stdout')}\n"
        f"FILES:\n" + "\n".join(snippets)
    )


def collect_bindings_packet(cwd: Path) -> str:
    chunks = []
    for name in (
        "wrangler.toml",
        "wrangler.workmode.toml",
        "wrangler.toml.example",
        "worker/index.js",
        "worker/index.ts",
    ):
        p = cwd / name
        if p.is_file():
            chunks.append(f"--- {name} ---\n{p.read_text(errors='replace')[:4000]}")
    return (
        "JOB=bindings\n"
        "Known live split:\n"
        "  agentsam-grok-workmode = UI Worker (dashboard currently ZERO bindings)\n"
        "  agentsam-workmode = vault API, D1 inneranimalmedia-business, routes /api/vault* /health\n"
        "Required UI bindings if we wire local Ollama via tunnel:\n"
        "  DB, WEBSITE_ASSETS, CMS_CACHE|SESSION_CACHE,\n"
        "  secrets OLLAMA_BASE_URL OLLAMA_TOKEN,\n"
        "  vars OLLAMA_MODEL OLLAMA_EMBED_MODEL\n"
        "Do not invent extra identifiers.\n"
        + "\n".join(chunks)
    )


def collect_census_packet(cwd: Path) -> str:
    loc = run(["git", "rev-list", "--count", "HEAD"], cwd)
    log = run(["git", "log", "-1", "--format=%h %ci %s"], cwd)
    files = run(["git", "ls-files"], cwd)
    n = len((files.get("stdout") or "").splitlines())
    wranglers = list(cwd.glob("wrangler*.toml")) + list(cwd.glob("wrangler*.toml.example"))
    return (
        f"JOB=census\npath={cwd}\ncommits={loc.get('stdout','').strip()}\n"
        f"head={log.get('stdout','').strip()}\ntracked_files={n}\n"
        f"wrangler_files={[str(p.name) for p in wranglers]}\n"
        "Return action keep|extract|archive in notes if you must, "
        "but keep the required JSON shape."
    )


def collect_generic(cwd: Path, extra: str) -> str:
    return f"JOB=generic\nCWD={cwd}\nREQUEST:\n{extra}"


def cmd_chat(args: argparse.Namespace) -> int:
    prompt = args.prompt or "Reply with JSON packet acknowledging you are the workhorse."
    raw = chat(SYSTEM_LAW, prompt)
    print(json.dumps(parse_model_json(raw), indent=2))
    return 0


def cmd_packet(args: argparse.Namespace) -> int:
    cwd = Path(args.cwd or os.getcwd()).resolve()
    kind = args.kind
    if kind == "pr":
        packet = collect_pr_packet(cwd)
    elif kind == "bindings":
        packet = collect_bindings_packet(cwd)
    elif kind == "census":
        packet = collect_census_packet(cwd)
    else:
        packet = collect_generic(cwd, args.prompt or "")
    if args.dump_packet:
        print(packet)
        return 0
    raw = chat(SYSTEM_LAW, packet)
    print(json.dumps({"packet_kind": kind, "cwd": str(cwd), "proposal": parse_model_json(raw)}, indent=2))
    return 0


def embed_text(text: str) -> list[float]:
    out = http_json("POST", f"{OLLAMA}/api/embeddings", {
        "model": EMBED_MODEL,
        "prompt": text,
    })
    vec = out.get("embedding")
    if not vec:
        raise SystemExit(f"No embedding returned: {out}")
    return vec


def cmd_embed(args: argparse.Namespace) -> int:
    vec = embed_text(args.prompt)
    print(json.dumps({"model": EMBED_MODEL, "dim": len(vec), "preview": vec[:8]}, indent=2))
    return 0


def iter_files(cwd: Path, globs: list[str]) -> list[Path]:
    out: list[Path] = []
    for g in globs:
        out.extend(cwd.rglob(g.strip()))
    uniq = []
    seen = set()
    for p in out:
        if not p.is_file():
            continue
        if any(part in {".git", "node_modules", "dist", ".wrangler"} for part in p.parts):
            continue
        if p.stat().st_size > 200_000:
            continue
        if p.resolve() in seen:
            continue
        seen.add(p.resolve())
        uniq.append(p)
    return uniq[:200]


def cosine(a: list[float], b: list[float]) -> float:
    s = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return s / (na * nb)


def index_path(cwd: Path) -> Path:
    return cwd / ".agentsam" / "embed-index.json"


def cmd_index_dir(args: argparse.Namespace) -> int:
    cwd = Path(args.cwd or os.getcwd()).resolve()
    globs = [g.strip() for g in (args.glob or "*.md,*.toml,*.json,*.js,*.ts").split(",") if g.strip()]
    files = iter_files(cwd, globs)
    rows = []
    for p in files:
        text = p.read_text(errors="replace")[:4000]
        vec = embed_text(f"{p.relative_to(cwd)}\n{text}")
        rows.append({"path": str(p.relative_to(cwd)), "dim": len(vec), "vec": vec})
        print(f"indexed {p.relative_to(cwd)}", file=sys.stderr)
    dest = index_path(cwd)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps({"model": EMBED_MODEL, "rows": rows}))
    print(json.dumps({"ok": True, "files": len(rows), "index": str(dest)}))
    return 0


def cmd_search(args: argparse.Namespace) -> int:
    cwd = Path(args.cwd or os.getcwd()).resolve()
    idx = index_path(cwd)
    if not idx.is_file():
        raise SystemExit(f"No index at {idx}. Run: as_workhorse.py index-dir --cwd {cwd}")
    data = json.loads(idx.read_text())
    q = embed_text(args.prompt)
    scored = []
    for row in data.get("rows", []):
        scored.append((cosine(q, row["vec"]), row["path"]))
    scored.sort(reverse=True)
    print(json.dumps({"query": args.prompt, "hits": [{"score": round(s, 4), "path": p} for s, p in scored[:12]]}, indent=2))
    return 0


WORKER_STUB = r'''
// Drop into agentsam-grok-workmode (UI Worker) — PROXY ONLY.
// Ollama stays on the iMac behind the tunnel. No GGUF on the edge.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/llm/health" && request.method === "GET") {
      try {
        const r = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, {
          headers: auth(env),
        });
        return json({ ok: r.ok, status: r.status, model: env.OLLAMA_MODEL });
      } catch (err) {
        return json({ ok: false, error: "Local model offline", detail: String(err) }, 503);
      }
    }

    if (url.pathname === "/api/llm/chat" && request.method === "POST") {
      const body = await request.json();
      const packet = body.packet || body.prompt || "";
      const r = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { ...auth(env), "content-type": "application/json" },
        body: JSON.stringify({
          model: env.OLLAMA_MODEL || "qwen2.5-coder",
          stream: false,
          messages: [
            { role: "system", content: env.WORKMODE_SYSTEM || "JSON only. Packet in." },
            { role: "user", content: packet },
          ],
        }),
      });
      return new Response(await r.text(), {
        status: r.status,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/api/llm/embed" && request.method === "POST") {
      const body = await request.json();
      const r = await fetch(`${env.OLLAMA_BASE_URL}/api/embeddings`, {
        method: "POST",
        headers: { ...auth(env), "content-type": "application/json" },
        body: JSON.stringify({
          model: env.OLLAMA_EMBED_MODEL || "mxbai-embed-large",
          prompt: body.prompt || "",
        }),
      });
      return new Response(await r.text(), {
        status: r.status,
        headers: { "content-type": "application/json" },
      });
    }

    return json({ error: "not found" }, 404);
  },
};

function auth(env) {
  const h = {};
  if (env.OLLAMA_TOKEN) h.Authorization = `Bearer ${env.OLLAMA_TOKEN}`;
  return h;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
'''

WRANGLER_SNIPPET = """
# Add to the UI Worker agentsam-grok-workmode (not the vault worker).
# Share D1 with agentsam-workmode instead of creating a second database.

# [[d1_databases]]
# binding = "DB"
# database_name = "inneranimalmedia-business"
# database_id = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"

# [[r2_buckets]]
# binding = "WEBSITE_ASSETS"
# bucket_name = "YOUR_BUCKET"

# [[kv_namespaces]]
# binding = "SESSION_CACHE"
# id = "YOUR_KV_ID"

# [vars]
# OLLAMA_MODEL = "qwen2.5-coder"
# OLLAMA_EMBED_MODEL = "mxbai-embed-large"

# Secrets (dashboard or wrangler secret put):
#   OLLAMA_BASE_URL   https://ollama.YOUR_TUNNEL_HOST
#   OLLAMA_TOKEN      (or CF Access service token)
"""


def cmd_emit(args: argparse.Namespace) -> int:
    dest = Path(args.out or "artifacts")
    dest.mkdir(parents=True, exist_ok=True)
    js = dest / "worker-llm-proxy.js"
    toml = dest / "wrangler-llm.snippet.toml"
    js.write_text(WORKER_STUB.strip() + "\n")
    toml.write_text(WRANGLER_SNIPPET.strip() + "\n")
    print(json.dumps({"wrote": [str(js), str(toml)]}, indent=2))
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="AgentSam iMac Ollama workhorse (not a Worker)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("health", help="List local Ollama models")
    sub.add_parser("ping", help="Generate ollama-ok")
    sub.add_parser("tools", help="Probe gh + wrangler + git (execute tools, not the model)")

    c = sub.add_parser("chat")
    c.add_argument("prompt", nargs="?", default="")

    pk = sub.add_parser("packet")
    pk.add_argument("job", nargs="?", default="job")
    pk.add_argument("--kind", choices=JOBS, default="generic")
    pk.add_argument("--cwd", default=None)
    pk.add_argument("--prompt", default="")
    pk.add_argument("--dump-packet", action="store_true")

    e = sub.add_parser("embed")
    e.add_argument("prompt")

    ix = sub.add_parser("index-dir")
    ix.add_argument("--cwd", default=None)
    ix.add_argument("--glob", default="*.md,*.toml,*.json,wrangler*")

    se = sub.add_parser("search")
    se.add_argument("prompt")
    se.add_argument("--cwd", default=None)

    em = sub.add_parser("emit-worker-stub")
    em.add_argument("--out", default=".")

    args = p.parse_args()
    fn = {
        "health": cmd_health,
        "ping": cmd_ping,
        "tools": cmd_tools,
        "chat": cmd_chat,
        "packet": cmd_packet,
        "embed": cmd_embed,
        "index-dir": cmd_index_dir,
        "search": cmd_search,
        "emit-worker-stub": cmd_emit,
    }[args.cmd]
    return fn(args)


if __name__ == "__main__":
    sys.exit(main())
