"""Current repository file discovery with git-first truth and filesystem fallback."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any, Iterable

DEFAULT_FALLBACK_EXCLUDE_DIRS = frozenset(
    {
        ".git",
        "node_modules",
        "dist",
        "build",
        "coverage",
        ".next",
        ".turbo",
        ".venv",
        "venv",
        "__pycache__",
    }
)

LANGUAGE_BY_EXT = {
    ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript", ".jsx": "JavaScript",
    ".ts": "TypeScript", ".tsx": "TypeScript", ".py": "Python", ".go": "Go",
    ".rs": "Rust", ".java": "Java", ".kt": "Kotlin", ".kts": "Kotlin",
    ".rb": "Ruby", ".php": "PHP", ".cs": "C#", ".c": "C", ".h": "C/C++",
    ".cc": "C/C++", ".cpp": "C/C++", ".hpp": "C/C++", ".swift": "Swift",
    ".scala": "Scala", ".sh": "Shell", ".bash": "Shell", ".zsh": "Shell",
    ".sql": "SQL", ".html": "HTML", ".css": "CSS", ".scss": "SCSS",
    ".vue": "Vue", ".svelte": "Svelte", ".md": "Markdown", ".mdx": "MDX",
    ".json": "JSON", ".jsonc": "JSON", ".toml": "TOML", ".yaml": "YAML", ".yml": "YAML",
}

MANIFEST_NAMES = {
    "package.json": "node", "pyproject.toml": "python", "requirements.txt": "python",
    "Cargo.toml": "rust", "go.mod": "go", "pom.xml": "java", "build.gradle": "gradle",
    "build.gradle.kts": "gradle", "Gemfile": "ruby", "composer.json": "php",
    "wrangler.toml": "cloudflare", "wrangler.json": "cloudflare", "wrangler.jsonc": "cloudflare",
    "Dockerfile": "container", "docker-compose.yml": "container", "docker-compose.yaml": "container",
}


def _git_paths(repo_root: Path) -> list[str]:
    try:
        raw = subprocess.check_output(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=repo_root,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return []
    return sorted({p.decode("utf-8", errors="surrogateescape") for p in raw.split(b"\0") if p})


def _walk_paths(repo_root: Path, exclude_dir_names: Iterable[str]) -> list[str]:
    excluded = set(exclude_dir_names)
    paths: list[str] = []
    for dirpath, dirnames, filenames in os.walk(repo_root, topdown=True):
        dirnames[:] = sorted(d for d in dirnames if d not in excluded)
        base = Path(dirpath)
        for name in sorted(filenames):
            path = base / name
            if path.is_symlink() or not path.is_file():
                continue
            try:
                paths.append(path.relative_to(repo_root).as_posix())
            except ValueError:
                continue
    return paths


def active_paths(
    repo_root: Path,
    *,
    fallback_exclude_dir_names: Iterable[str] = DEFAULT_FALLBACK_EXCLUDE_DIRS,
) -> tuple[list[str], str]:
    """Return active paths and discovery source (`git` or `filesystem`)."""
    paths = _git_paths(repo_root)
    if paths:
        return paths, "git"
    return _walk_paths(repo_root, fallback_exclude_dir_names), "filesystem"


def _line_count(path: Path) -> int | None:
    try:
        with path.open("r", encoding="utf-8", errors="strict") as fh:
            return sum(1 for _ in fh)
    except (UnicodeDecodeError, OSError):
        return None


def file_records(repo_root: Path, paths: Iterable[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for rel in paths:
        path = repo_root / rel
        try:
            stat = path.stat()
        except OSError:
            continue
        if not path.is_file():
            continue
        ext = path.suffix.lower()
        language = LANGUAGE_BY_EXT.get(ext)
        parts = Path(rel).parts
        rows.append(
            {
                "path": rel,
                "parent": Path(rel).parent.as_posix() if len(parts) > 1 else ".",
                "top_dir": parts[0] if len(parts) > 1 else ".",
                "ext": ext or None,
                "language": language,
                "size_bytes": int(stat.st_size),
                "lines": _line_count(path) if language else None,
            }
        )
    return rows


def detect_manifests(files: Iterable[dict[str, Any]]) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    for row in files:
        name = Path(row["path"]).name
        kind = MANIFEST_NAMES.get(name)
        if kind:
            found.append({"path": row["path"], "kind": kind})
    return sorted(found, key=lambda row: (row["kind"], row["path"]))
