#!/usr/bin/env python3
"""Read-only, stdlib-only inventory of native CAD/BIM/visualization assets."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import platform
import sys

KINDS = {
    ".fcstd": "freecad", ".ifc": "bim_ifc", ".blend": "blender",
    ".scad": "openscad", ".step": "step", ".stp": "step",
    ".dxf": "dxf", ".svg": "svg", ".glb": "glb",
    ".gltf": "gltf", ".stl": "stl", ".obj": "obj",
}
SKIP_DIRS = {
    ".git", ".agentsam", ".wrangler", "node_modules", ".venv", "venv",
    "__pycache__", ".next", ".cache", "dist", "build", "coverage",
}
MAX_ASSETS = 2000
MAX_HASH_BYTES_PER_ASSET = 128 * 1024 * 1024
MAX_HASH_BYTES_TOTAL = 512 * 1024 * 1024
CHUNK_BYTES = 1024 * 1024


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(CHUNK_BYTES)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def inventory(root: Path, payload: dict | None = None) -> dict:
    if sys.version_info < (3, 10):
        raise RuntimeError("python_3_10_or_newer_required")
    if payload not in (None, {}):
        raise ValueError("inventory_input_must_be_empty_object")
    root = root.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("inventory_root_not_directory")
    counts: dict[str, int] = {}
    assets: list[dict] = []
    truncated = False
    hashed_bytes = 0
    for current, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = sorted(
            name for name in dirs
            if name not in SKIP_DIRS
            and not name.startswith(".")
            and not (Path(current) / name).is_symlink()
        )
        for name in sorted(files):
            entry = Path(current) / name
            kind = KINDS.get(entry.suffix.lower())
            if not kind or entry.is_symlink():
                continue
            if len(assets) >= MAX_ASSETS:
                truncated = True
                break
            try:
                stat = entry.stat(follow_symlinks=False)
            except OSError:
                continue
            if not entry.is_file():
                continue
            digest = None
            hash_status = "hashed"
            if stat.st_size > MAX_HASH_BYTES_PER_ASSET:
                hash_status = "size_limit"
            elif hashed_bytes + stat.st_size > MAX_HASH_BYTES_TOTAL:
                hash_status = "budget_limit"
            else:
                try:
                    digest = _hash_file(entry)
                    hashed_bytes += stat.st_size
                except OSError:
                    hash_status = "read_error"
            assets.append({
                "path": entry.relative_to(root).as_posix(),
                "kind": kind,
                "bytes": stat.st_size,
                "sha256": digest,
                "hash_status": hash_status,
            })
            counts[kind] = counts.get(kind, 0) + 1
        if truncated:
            break
    return {
        "schema": "inneranimalmedia.primetech.asset-inventory.v1",
        "ok": True,
        "total": len(assets),
        "counts": dict(sorted(counts.items())),
        "assets": assets,
        "truncated": truncated,
        "engine": {"name": "python", "version": platform.python_version()},
    }


if __name__ == "__main__":
    try:
        payload = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
        result = inventory(Path.cwd(), payload)
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    except (OSError, ValueError, RuntimeError) as exc:
        print(json.dumps({
            "schema": "inneranimalmedia.primetech.asset-inventory.v1",
            "ok": False,
            "error": str(exc),
        }, sort_keys=True, separators=(",", ":")), file=sys.stderr)
        sys.exit(2)
