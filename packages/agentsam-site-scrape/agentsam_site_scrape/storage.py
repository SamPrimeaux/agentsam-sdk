"""Resolve project-owned crawl storage; never default to the SDK publisher's R2.

Selection belongs to the current project/user. R2 uses the caller's actual
Wrangler profile; this module neither provisions buckets nor grants permission.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from .wrangler_bucket import _candidate_configs, _bucket_from_json, _bucket_from_toml

BUCKET = re.compile(r"[a-z0-9][a-z0-9-]{1,62}[a-z0-9]\Z")
BINDING = "CRAWL_EVIDENCE"
CONFIG = ".agentsam/site-scrape.json"


def resolve_evidence_bucket(project_root: Path, *, selected_bucket: str | None = None,
                            wrangler_config: str | None = None) -> dict:
    """Explicit selection > project config > its Wrangler binding; otherwise fail closed."""
    root = Path(project_root).resolve()
    if not root.is_dir():
        raise ValueError("project_root must be an existing project directory")
    source = None
    bucket = None
    if selected_bucket:
        bucket, source = selected_bucket, "explicit-user-selection"
    else:
        project_config = root / CONFIG
        if project_config.is_file():
            config = json.loads(project_config.read_text(encoding="utf-8"))
            selection = config.get("storage", {}).get("evidence", {})
            if selection.get("provider") == "local":
                raise ValueError("project selected local evidence storage; remote upload is not enabled")
            if selection.get("provider") not in (None, "r2"):
                raise ValueError("unsupported project evidence storage provider")
            bucket = selection.get("bucket")
            if bucket:
                source = f"project:{CONFIG}"
        if not bucket:
            for path in _candidate_configs(root, wrangler_config):
                if not path.is_file():
                    continue
                body = path.read_text(encoding="utf-8")
                candidate = (_bucket_from_json(body, BINDING) if path.suffix in (".json", ".jsonc")
                             else _bucket_from_toml(body, BINDING))
                if candidate:
                    bucket, source = candidate, f"wrangler:{path.name}:{BINDING}"
                    break
    if not isinstance(bucket, str) or not BUCKET.fullmatch(bucket):
        raise ValueError(
            "No project-owned R2 crawl evidence destination. Select --archive-bucket, "
            f"configure {CONFIG} storage.evidence.bucket, or bind {BINDING} in the PROJECT's Wrangler config. "
            "No account-wide/default publisher bucket is used."
        )
    return {"provider": "r2", "bucket": bucket, "source": source, "project_root": str(root)}
