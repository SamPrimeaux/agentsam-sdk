#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sqlite3
import struct
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from common import human_bytes, is_media, repo_rel, sha256_file, walk_files, write_json


def image_dimensions(path: Path) -> Tuple[Optional[int], Optional[int]]:
    suffix = path.suffix.lower()
    try:
        if suffix == ".png":
            with path.open("rb") as f:
                sig = f.read(24)
            if sig[:8] == b"\x89PNG\r\n\x1a\n":
                return struct.unpack(">II", sig[16:24])

        if suffix in {".jpg", ".jpeg"}:
            with path.open("rb") as f:
                data = f.read(2)
                if data != b"\xff\xd8":
                    return None, None
                while True:
                    marker_start = f.read(1)
                    if not marker_start:
                        break
                    if marker_start != b"\xff":
                        continue
                    marker = f.read(1)
                    while marker == b"\xff":
                        marker = f.read(1)
                    if marker in {b"\xc0", b"\xc1", b"\xc2", b"\xc3", b"\xc5", b"\xc6", b"\xc7", b"\xc9", b"\xca", b"\xcb", b"\xcd", b"\xce", b"\xcf"}:
                        _length = struct.unpack(">H", f.read(2))[0]
                        _precision = f.read(1)
                        h, w = struct.unpack(">HH", f.read(4))
                        return w, h
                    length_bytes = f.read(2)
                    if len(length_bytes) != 2:
                        break
                    length = struct.unpack(">H", length_bytes)[0]
                    f.seek(length - 2, 1)

        if suffix == ".gif":
            with path.open("rb") as f:
                head = f.read(10)
            if head[:6] in {b"GIF87a", b"GIF89a"}:
                w, h = struct.unpack("<HH", head[6:10])
                return w, h

        if suffix == ".svg":
            root = ET.parse(path).getroot()
            def num(v):
                if not v:
                    return None
                out = "".join(c for c in v if c.isdigit() or c in ".-")
                return int(float(out)) if out else None
            w = num(root.attrib.get("width"))
            h = num(root.attrib.get("height"))
            if w and h:
                return w, h
            vb = root.attrib.get("viewBox")
            if vb:
                parts = [float(x) for x in vb.replace(",", " ").split()]
                if len(parts) == 4:
                    return int(parts[2]), int(parts[3])
    except Exception:
        pass

    try:
        from PIL import Image  # optional
        with Image.open(path) as im:
            return int(im.width), int(im.height)
    except Exception:
        return None, None


def classify_role(path: Path, width: Optional[int], height: Optional[int]) -> str:
    n = path.name.lower()
    if "logo" in n or "wordmark" in n or "mark" in n:
        return "brand_identity_candidate"
    if "icon" in n or "favicon" in n:
        return "icon_candidate"
    if "hero" in n or "banner" in n:
        return "hero_candidate"
    if "product" in n or "mockup" in n:
        return "product_candidate"
    if "social" in n or "og-" in n or "instagram" in n:
        return "social_candidate"
    if width and height:
        ratio = width / height if height else 0
        if ratio > 1.7:
            return "landscape_media"
        if ratio < 0.72:
            return "portrait_media"
    return "unclassified"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--roots", nargs="*", default=["apps", "assets", "packages"])
    ap.add_argument("--out", default=".agentsam/brandops/media-inventory.json")
    ap.add_argument("--sqlite", default=".agentsam/brandops/media.sqlite")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    records = []
    by_hash = defaultdict(list)

    for raw_root in args.roots:
        root = (repo / raw_root).resolve()
        if not root.exists():
            continue
        for path in walk_files(root):
            if not is_media(path):
                continue
            try:
                stat = path.stat()
                digest = sha256_file(path)
            except OSError:
                continue
            w, h = image_dimensions(path)
            rec = {
                "path": repo_rel(path, repo),
                "bytes": stat.st_size,
                "human_bytes": human_bytes(stat.st_size),
                "sha256": digest,
                "extension": path.suffix.lower(),
                "width": w,
                "height": h,
                "role_candidate": classify_role(path, w, h),
            }
            records.append(rec)
            by_hash[digest].append(rec["path"])

    duplicates = [
        {"sha256": h, "paths": paths, "count": len(paths)}
        for h, paths in by_hash.items()
        if len(paths) > 1
    ]

    report = {
        "repo": str(repo),
        "media_count": len(records),
        "total_bytes": sum(r["bytes"] for r in records),
        "total_human": human_bytes(sum(r["bytes"] for r in records)),
        "duplicates": sorted(duplicates, key=lambda x: (-x["count"], x["sha256"])),
        "records": sorted(records, key=lambda x: x["path"]),
    }

    out = repo / args.out if not Path(args.out).is_absolute() else Path(args.out)
    write_json(out, report)

    db_path = repo / args.sqlite if not Path(args.sqlite).is_absolute() else Path(args.sqlite)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(db_path))
    try:
        con.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS media_inventory (
            path TEXT PRIMARY KEY,
            sha256 TEXT NOT NULL,
            bytes INTEGER NOT NULL,
            extension TEXT,
            width INTEGER,
            height INTEGER,
            role_candidate TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_media_inventory_sha256 ON media_inventory(sha256);
        """)
        con.execute("DELETE FROM media_inventory")
        con.executemany(
            """INSERT INTO media_inventory
               (path, sha256, bytes, extension, width, height, role_candidate)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            [
                (
                    r["path"], r["sha256"], r["bytes"], r["extension"],
                    r["width"], r["height"], r["role_candidate"],
                )
                for r in records
            ],
        )
        con.commit()
    finally:
        con.close()

    print(f"media: {len(records)}")
    print(f"bytes: {report['total_human']}")
    print(f"duplicate groups: {len(duplicates)}")
    print(f"json: {out}")
    print(f"sqlite: {db_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
