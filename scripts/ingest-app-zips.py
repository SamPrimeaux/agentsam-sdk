#!/usr/bin/env python3
"""Safely ingest dropped app ZIPs into agentsam-sdk/apps/.

Default behavior is a dry run. Use --apply to extract.

Conventions:
  - Drop ZIPs in the repository root or apps/_incoming/.
  - A known mapping can rename a donor ZIP to its canonical app slug.
  - Otherwise <name>.zip -> apps/<name>/.
  - Imported source is left structurally intact for later agent normalization.
  - The original ZIP is archived under apps/<slug>/_imports/ after a successful import.

Examples:
  python3 scripts/ingest-app-zips.py
  python3 scripts/ingest-app-zips.py --apply
  python3 scripts/ingest-app-zips.py --zip my-cms.zip --app cms-studio --apply
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APPS = ROOT / "apps"
INCOMING = APPS / "_incoming"

KNOWN_MAP = {
    "agentsam-design-studio.zip": "cad-creator",
}

SKIP_PARTS = {
    ".git",
    "node_modules",
    "__MACOSX",
    ".DS_Store",
    "dist",
    "build",
    ".output",
    ".wrangler",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def slugify(name: str) -> str:
    raw = name.lower().removesuffix(".zip")
    out = []
    dash = False
    for ch in raw:
        if ch.isalnum():
            out.append(ch)
            dash = False
        elif not dash:
            out.append("-")
            dash = True
    slug = "".join(out).strip("-")
    if not slug:
        raise ValueError(f"cannot derive app slug from {name!r}")
    return slug


def discover() -> list[Path]:
    found: list[Path] = []
    for base in (ROOT, INCOMING):
        if base.exists():
            found.extend(sorted(p for p in base.glob("*.zip") if p.is_file()))
    return found


def validate_member(name: str) -> PurePosixPath | None:
    # ZIP member paths are always POSIX-style by spec/convention.
    pp = PurePosixPath(name)
    if not name or name.endswith("/"):
        return None
    if pp.is_absolute() or ".." in pp.parts:
        raise ValueError(f"unsafe ZIP path: {name}")
    if any(part in SKIP_PARTS for part in pp.parts):
        return None
    # Never import real dotenv files. Example files are source documentation.
    if pp.name == ".env" or (pp.name.startswith(".env.") and pp.name != ".env.example"):
        return None
    return pp


def common_wrapper(paths: list[PurePosixPath]) -> str | None:
    if not paths:
        return None
    first = paths[0].parts[0]
    if all(len(p.parts) > 1 and p.parts[0] == first for p in paths):
        return first
    return None


def plan_zip(zip_path: Path, app_slug: str) -> tuple[list[tuple[zipfile.ZipInfo, PurePosixPath]], str | None]:
    planned: list[tuple[zipfile.ZipInfo, PurePosixPath]] = []
    with zipfile.ZipFile(zip_path) as zf:
        validated: list[tuple[zipfile.ZipInfo, PurePosixPath]] = []
        for info in zf.infolist():
            rel = validate_member(info.filename)
            if rel is not None:
                validated.append((info, rel))
        wrapper = common_wrapper([rel for _, rel in validated])
        for info, rel in validated:
            if wrapper:
                rel = PurePosixPath(*rel.parts[1:])
            if rel.parts:
                planned.append((info, rel))
    return planned, wrapper


def extract(zip_path: Path, app_slug: str, *, merge: bool, archive_zip: bool) -> dict:
    target = APPS / app_slug
    planned, wrapper = plan_zip(zip_path, app_slug)
    if not planned:
        raise ValueError(f"no scaffold-safe files found in {zip_path.name}")

    existing_source = target.exists() and any(
        child.name not in {"_imports", "IMPORT_PROVENANCE.json"}
        for child in target.iterdir()
    )
    if existing_source and not merge:
        raise FileExistsError(
            f"{target} already contains source; use --merge only when intentionally layering another ZIP"
        )

    with tempfile.TemporaryDirectory(prefix=f"agentsam-{app_slug}-") as td:
        staging = Path(td) / "source"
        staging.mkdir(parents=True)
        with zipfile.ZipFile(zip_path) as zf:
            for info, rel in planned:
                out = staging.joinpath(*rel.parts)
                out.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(info) as src, out.open("wb") as dst:
                    shutil.copyfileobj(src, dst)

        target.mkdir(parents=True, exist_ok=True)
        for src in staging.rglob("*"):
            if not src.is_file():
                continue
            rel = src.relative_to(staging)
            out = target / rel
            if out.exists() and not merge:
                raise FileExistsError(f"refusing to overwrite {out}")
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, out)

    digest = sha256(zip_path)
    archive_path = None
    if archive_zip:
        imports = target / "_imports"
        imports.mkdir(parents=True, exist_ok=True)
        archive_path = imports / zip_path.name
        if archive_path.resolve() != zip_path.resolve():
            if archive_path.exists():
                if sha256(archive_path) != digest:
                    raise FileExistsError(f"archive collision: {archive_path}")
                zip_path.unlink()
            else:
                shutil.move(str(zip_path), str(archive_path))

    provenance = {
        "kind": "agentsam-app-zip-import",
        "app": app_slug,
        "source_zip": archive_path.relative_to(ROOT).as_posix() if archive_path else zip_path.name,
        "source_sha256": digest,
        "stripped_single_wrapper": wrapper,
        "imported_file_count": len(planned),
        "policy": {
            "skipped": sorted(SKIP_PARTS),
            "dotenv": "real .env files excluded; .env.example allowed",
            "normalization": "source preserved; agents solidify after import",
        },
    }
    (target / "IMPORT_PROVENANCE.json").write_text(json.dumps(provenance, indent=2) + "\n")
    return provenance


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", action="append", dest="zips", help="ZIP path; repeatable")
    ap.add_argument("--app", help="canonical app slug; only valid with exactly one --zip")
    ap.add_argument("--apply", action="store_true", help="perform extraction (default is dry-run)")
    ap.add_argument("--merge", action="store_true", help="allow layering files into an existing app")
    ap.add_argument("--keep-zip", action="store_true", help="leave the source ZIP where it was")
    args = ap.parse_args()

    if args.zips:
        zips = [(ROOT / z).resolve() if not Path(z).is_absolute() else Path(z).resolve() for z in args.zips]
    else:
        zips = discover()

    if args.app and len(zips) != 1:
        ap.error("--app requires exactly one --zip")
    if not zips:
        print("No ZIPs found in repository root or apps/_incoming/.")
        return 0

    jobs: list[tuple[Path, str]] = []
    for zp in zips:
        if not zp.is_file():
            raise SystemExit(f"ZIP not found: {zp}")
        app = args.app or KNOWN_MAP.get(zp.name) or slugify(zp.name)
        jobs.append((zp, app))

    for zp, app in jobs:
        planned, wrapper = plan_zip(zp, app)
        print(f"{zp.relative_to(ROOT) if zp.is_relative_to(ROOT) else zp} -> apps/{app}/")
        print(f"  files: {len(planned)}")
        print(f"  sha256: {sha256(zp)}")
        if wrapper:
            print(f"  strip wrapper: {wrapper}/")
        if not args.apply:
            print("  dry-run")
            continue
        result = extract(zp, app, merge=args.merge, archive_zip=not args.keep_zip)
        print(f"  imported: {result['imported_file_count']} files")
        print(f"  provenance: apps/{app}/IMPORT_PROVENANCE.json")

    if not args.apply:
        print("\nDry run only. Re-run with --apply to ingest.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
