from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


IGNORE_DIRS = {
    ".git", "node_modules", "dist", "build", ".output", ".next",
    ".wrangler", "target", ".turbo", ".cache", ".agentsam",
}

MEDIA_EXTS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif",
    ".heic", ".tif", ".tiff", ".bmp", ".ico", ".pdf", ".mp4",
    ".mov", ".m4v", ".webm", ".woff", ".woff2", ".ttf", ".otf",
}


def repo_rel(path: Path, repo: Path) -> str:
    try:
        return str(path.resolve().relative_to(repo.resolve()))
    except Exception:
        return str(path.resolve())


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def walk_files(root: Path) -> Iterable[Path]:
    if not root.exists():
        return
    for base, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for name in names:
            yield Path(base) / name


def is_media(path: Path) -> bool:
    return path.suffix.lower() in MEDIA_EXTS


def human_bytes(n: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    x = float(n)
    for unit in units:
        if x < 1024 or unit == units[-1]:
            return f"{x:.1f} {unit}"
        x /= 1024
    return f"{n} B"


def package_jsons(repo: Path) -> List[Path]:
    out: List[Path] = []
    for root_name in ("packages", "apps"):
        root = repo / root_name
        if not root.exists():
            continue
        for p in walk_files(root):
            if p.name == "package.json":
                out.append(p)
    return sorted(out)


def load_package_name(package_json: Path) -> Optional[str]:
    try:
        data = read_json(package_json)
        return data.get("name")
    except Exception:
        return None
