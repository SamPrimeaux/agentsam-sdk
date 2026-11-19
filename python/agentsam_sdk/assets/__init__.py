"""Project-scoped native asset inventory, with no rendering or external CAD dependencies."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path

ASSET_TYPES: dict[str, str] = {
    ".step": "cad", ".stp": "cad", ".brep": "cad", ".iges": "cad", ".igs": "cad",
    ".stl": "mesh", ".obj": "mesh", ".3mf": "mesh", ".ply": "mesh",
    ".glb": "scene", ".gltf": "scene", ".fbx": "scene", ".usd": "scene",
    ".usdz": "scene", ".blend": "scene", ".fcstd": "cad", ".scad": "cad",
    ".dxf": "drawing", ".dwg": "drawing", ".svg": "drawing", ".pdf": "drawing",
    ".nc": "toolpath", ".gcode": "toolpath", ".tap": "toolpath",
    ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image",
    ".tiff": "image", ".exr": "image", ".hdr": "image",
    ".mp4": "video", ".mov": "video", ".webm": "video",
    ".wav": "audio", ".flac": "audio", ".mp3": "audio",
}
SKIP_DIRS = frozenset({
    ".git", ".agentsam", ".venv", "venv", "node_modules", "__pycache__", ".next",
})


class AssetInventoryError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def _file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


class AssetsClient:
    """Read-only inventory within a caller-selected project root.

    Never follows symlinks and never calls a third-party CAD application.
    It identifies files, not their validity or production readiness.
    """

    def __init__(self, workspace_root: str | Path, *, invoke=None):
        self.root = Path(workspace_root).expanduser().resolve()
        self._invoke = invoke

    def inventory(
        self, path: str | Path = ".", *, include_hashes: bool = False,
        limit: int = 5000, max_depth: int = 12,
    ) -> dict:
        if not isinstance(include_hashes, bool):
            raise AssetInventoryError("asset_inventory_hash_flag_invalid", "include_hashes must be true or false.")
        if not isinstance(path, (str, Path)):
            raise AssetInventoryError("asset_inventory_path_invalid", "Asset path must be a project-relative path.")
        if self._invoke is not None:
            response = self._invoke("assets.inventory", {
                "path": str(path), "include_hashes": include_hashes,
                "limit": limit, "max_depth": max_depth,
            })
            if not response.get("ok"):
                error = response.get("error") or {}
                raise AssetInventoryError(error.get("code", "asset_inventory_failed"),
                                          error.get("message", "Asset inventory failed."))
            return response["data"]
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 100_000:
            raise AssetInventoryError("asset_inventory_limit_invalid", "The file limit must be between 1 and 100000.")
        if not isinstance(max_depth, int) or isinstance(max_depth, bool) or not 0 <= max_depth <= 32:
            raise AssetInventoryError("asset_inventory_depth_invalid", "Maximum scan depth must be between 0 and 32.")
        path = Path(path)
        if path.is_absolute() or ".." in path.parts:
            raise AssetInventoryError("asset_inventory_path_outside_scope", "Choose a directory inside the workspace.")
        root = (self.root / path).resolve()
        if root != self.root and self.root not in root.parents:
            raise AssetInventoryError("asset_inventory_path_outside_scope", "Directory escapes the workspace.")
        if not root.is_dir():
            raise AssetInventoryError("asset_inventory_target_not_found", f"Directory not found: {path}")
        rows: list[dict] = []
        by_kind: dict[str, int] = {}
        by_format: dict[str, int] = {}
        total_bytes = 0
        truncated = False

        for folder, dirs, files in os.walk(root, topdown=True, followlinks=False):
            current = Path(folder)
            depth = len(current.relative_to(root).parts)
            dirs[:] = sorted(
                directory for directory in dirs
                if not directory.startswith(".") and directory not in SKIP_DIRS
                and not (current / directory).is_symlink()
            ) if depth < max_depth else []
            for name in sorted(files):
                if name.startswith("."):
                    continue
                extension = Path(name).suffix.lower()
                kind = ASSET_TYPES.get(extension)
                if kind is None:
                    continue
                candidate = current / name
                if candidate.is_symlink():
                    continue
                try:
                    stat = candidate.stat()
                    if not candidate.is_file():
                        continue
                except OSError:
                    continue
                if len(rows) >= limit:
                    truncated = True
                    break
                relative = candidate.relative_to(self.root).as_posix()
                entry = {"path": relative, "kind": kind, "format": extension.lstrip("."),
                         "bytes": stat.st_size}
                if include_hashes:
                    try:
                        entry["sha256"] = _file_hash(candidate)
                    except OSError as exc:
                        raise AssetInventoryError("asset_inventory_read_failed", f"Unable to hash {relative}: {exc}") from exc
                rows.append(entry)
                total_bytes += stat.st_size
                by_kind[kind] = by_kind.get(kind, 0) + 1
                by_format[extension.lstrip(".")] = by_format.get(extension.lstrip("."), 0) + 1
            if truncated:
                break
        return {
            "schema": "agentsam.assets.inventory.v1",
            "root": str(root), "total": len(rows), "bytes": total_bytes,
            "by_kind": dict(sorted(by_kind.items())), "by_format": dict(sorted(by_format.items())),
            "items": rows, "hashed": include_hashes, "truncated": truncated,
            "note": "File presence only; geometry and manufacturing validity are not verified.",
        }


__all__ = ["ASSET_TYPES", "AssetInventoryError", "AssetsClient"]
