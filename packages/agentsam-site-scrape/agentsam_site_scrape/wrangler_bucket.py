"""Resolve WEBSITE_ASSETS bucket_name from a client worker wrangler config."""

from __future__ import annotations

import json
import re
from pathlib import Path

from .config import WEBSITE_ASSETS_BINDING


def _candidate_configs(repo_root: Path, explicit: str | None) -> list[Path]:
    if explicit:
        p = Path(explicit)
        return [p if p.is_absolute() else repo_root / p]
    names = (
        "wrangler.jsonc",
        "wrangler.json",
        "wrangler.toml",
        "wrangler.production.toml",
        "wrangler.production.jsonc",
    )
    return [repo_root / n for n in names]


def _strip_jsonc(text: str) -> str:
    # Drop // line comments and /* */ blocks — good enough for wrangler.jsonc.
    no_block = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    lines = []
    for line in no_block.splitlines():
        if "//" in line:
            in_str = False
            out = []
            i = 0
            while i < len(line):
                ch = line[i]
                if ch == '"' and (i == 0 or line[i - 1] != "\\"):
                    in_str = not in_str
                if not in_str and line[i:i + 2] == "//":
                    break
                out.append(ch)
                i += 1
            lines.append("".join(out))
        else:
            lines.append(line)
    return "\n".join(lines)


def _bucket_from_json(text: str, binding: str) -> str | None:
    data = json.loads(_strip_jsonc(text))
    for row in data.get("r2_buckets") or []:
        if row.get("binding") == binding and row.get("bucket_name"):
            return str(row["bucket_name"]).strip()
    return None


def _bucket_from_toml(text: str, binding: str) -> str | None:
    # Minimal TOML scan for [[r2_buckets]] blocks — avoids adding tomllib-only edge cases
    # on older Python; 3.11+ has tomllib but keep this simple and deterministic.
    blocks = re.split(r"\[\[r2_buckets\]\]", text)
    for block in blocks[1:]:
        bind_m = re.search(r'binding\s*=\s*"([^"]+)"', block)
        buck_m = re.search(r'bucket_name\s*=\s*"([^"]+)"', block)
        if bind_m and buck_m and bind_m.group(1) == binding:
            return buck_m.group(1).strip()
    return None


def resolve_website_assets_bucket(
    repo_root: Path,
    *,
    wrangler_config: str | None = None,
    binding: str = WEBSITE_ASSETS_BINDING,
) -> str:
    """Return bucket_name for WEBSITE_ASSETS or raise with a loud message."""
    root = repo_root.resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"--repo-root is not a directory: {root}")

    tried: list[str] = []
    for path in _candidate_configs(root, wrangler_config):
        tried.append(str(path))
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        if path.suffix in {".json", ".jsonc"}:
            bucket = _bucket_from_json(text, binding)
        else:
            bucket = _bucket_from_toml(text, binding)
        if bucket:
            return bucket

    raise RuntimeError(
        f"No R2 binding '{binding}' with bucket_name found under {root}. "
        f"Tried: {', '.join(tried)}. "
        "Pass --bucket explicitly, or add the binding to the client worker wrangler config. "
        "Do not use the IAM platform monorepo as --repo-root."
    )
