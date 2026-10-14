#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict, List

from common import read_json, write_json


def value(value=None, state="unknown", confidence=None, evidence=None):
    return {
        "value": value,
        "state": state,
        "confidence": confidence,
        "evidence": evidence or [],
    }


def normalize_brand(item: Dict[str, Any]) -> Dict[str, str]:
    brand_id = str(item.get("id") or "").strip()
    name = str(item.get("name") or "").strip()

    if not brand_id or not name:
        raise ValueError("Each brand entry requires non-empty 'id' and 'name'.")

    return {"id": brand_id, "name": name}


def workspace(brand_id: str, name: str) -> Dict[str, Any]:
    return {
        "schema": "agentsam.brand-workspace.v1",
        "brand": {
            "id": brand_id,
            "name": name,
            "status": "seeded-needs-evidence",
        },
        "relationships": [],
        "foundation": {
            "purpose": value(),
            "mission": value(),
            "vision": value(),
            "principles": value(),
        },
        "audience": {
            "primary": value(),
            "problem": value(),
            "market": value(),
        },
        "positioning": {
            "position": value(),
            "promise": value(),
            "differentiation": value(),
            "proof": value(),
        },
        "identity": {
            "voice": value(),
            "vocabulary": value(),
            "palette": value(),
            "typography": value(),
            "logos": value(),
            "imagery": value(),
        },
        "brand_contract": None,
        "brand_pack": None,
        "evidence": [],
        "concepts": [],
        "collections": [],
        "content_refs": [],
        "campaign_refs": [],
        "findings": [],
        "decisions": [],
        "surface_profiles": [],
        "presentation": {
            "view": "stream",
            "featured": [],
            "sections": [],
            "order": [],
        },
        "guardrails": [
            "Unknown stays unknown until evidence or declaration exists.",
            "Observed does not imply approved.",
            "Cross-brand relationships do not imply palette/type/voice inheritance.",
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser(
        description=(
            "Seed BrandWorkspace fixtures from an explicit operator-supplied manifest. "
            "No brands are hardcoded into this tool."
        )
    )
    ap.add_argument(
        "--manifest",
        required=True,
        help="JSON file shaped as {\"brands\":[{\"id\":\"acme\",\"name\":\"Acme\"}]}",
    )
    ap.add_argument("--out", default="fixtures/brands")
    args = ap.parse_args()

    manifest = read_json(Path(args.manifest))
    raw_brands = manifest.get("brands")
    if not isinstance(raw_brands, list) or not raw_brands:
        raise SystemExit("Manifest must contain a non-empty 'brands' array.")

    brands: List[Dict[str, str]] = [normalize_brand(x) for x in raw_brands]

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    for brand in brands:
        path = out / f"{brand['id']}.workspace.json"
        write_json(path, workspace(brand["id"], brand["name"]))
        print(f"wrote: {path}")

    portfolio = {
        "schema": "agentsam.brand-portfolio.v1",
        "brands": [b["id"] for b in brands],
        "rules": [
            "Portfolio presentation may mix brands but must never merge brand authority.",
            "Copied concepts become new proposals with provenance.",
        ],
    }
    write_json(out / "all-worlds.json", portfolio)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
