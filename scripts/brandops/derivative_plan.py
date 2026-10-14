#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, List

from common import read_json, write_json


DEFAULT_PRESETS = {
    "thumbnail": {"max_width": 240, "format": "webp", "quality": 78},
    "grid": {"max_width": 480, "format": "webp", "quality": 80},
    "detail": {"max_width": 1280, "format": "webp", "quality": 84},
}

ROLE_PRESETS = {
    "hero_candidate": [
        {"purpose": "hero", "max_width": 1920, "format": "webp", "quality": 86},
        {"purpose": "social", "width": 1200, "height": 630, "format": "webp", "quality": 84},
    ],
    "product_candidate": [
        {"purpose": "storefront", "max_width": 1200, "format": "webp", "quality": 84},
    ],
    "brand_identity_candidate": [
        {"purpose": "brand_preview", "max_width": 1000, "format": "png", "quality": None},
    ],
}


def plan_for(record: Dict) -> List[Dict]:
    ext = record.get("extension", "").lower()

    if ext in {".svg", ".woff", ".woff2", ".ttf", ".otf", ".pdf", ".mp4", ".mov", ".m4v", ".webm"}:
        return []

    variants = [
        {"purpose": purpose, **cfg}
        for purpose, cfg in DEFAULT_PRESETS.items()
    ]
    variants.extend(ROLE_PRESETS.get(record.get("role_candidate"), []))
    return variants


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--inventory", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    inv = read_json(Path(args.inventory))
    assets = []

    for record in inv["records"]:
        variants = plan_for(record)
        assets.append({
            "source": record["path"],
            "source_sha256": record["sha256"],
            "role_candidate": record.get("role_candidate"),
            "variants": variants,
        })

    plan = {
        "schema": "agentsam.media-derivative-plan.v1",
        "dry_run": True,
        "laws": [
            "Master/source is immutable.",
            "Preview framing is not a derivative.",
            "Prepared versions are physical objects with provenance.",
            "Do not downscale print/identity authority merely for delivery convenience.",
        ],
        "assets": assets,
    }

    write_json(Path(args.out), plan)
    count = sum(len(x["variants"]) for x in assets)
    print(f"assets planned: {len(assets)}")
    print(f"derivatives planned: {count}")
    print(f"wrote: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
