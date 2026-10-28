#!/usr/bin/env python3
"""Derive a readonly portal demo product catalog from Resolve's actual shipped React bundle.

This is a packaging convenience, NOT a production products database.
If the Resolve storefront bundle is regenerated, rerun this script and review its diff.
"""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
bundles = list((root / "site" / "assets").glob("index-*.js"))
if len(bundles) != 1:
    raise SystemExit("Expected exactly one Resolve storefront JS bundle.")
source = bundles[0].read_text(encoding="utf8")
start = source.find("U=[{id:")
if start < 0:
    raise SystemExit("Original Resolve demo catalog not found; avoid generating a fake catalog.")
tick = chr(96)
end = source.find("],Iu=", start)
text = source[start:end if end > 0 else start + 30000]
pattern = "id:" + tick + "([^" + tick + "]+)" + tick + ",name:" + tick + "([^" + tick + "]+)" + tick + ",category:" + tick + "([^" + tick + "]+)" + tick + ",price:(\\d+)"
matches = list(re.finditer(pattern, text))
images = {
    "Au": "media-216610d365.webp", "ju": "media-a70660bfa9.webp",
    "Mu": "media-ced60fcecc.webp", "H": "media-2a9e0f623f.webp",
    "Nu": "media-bc1322e813.webp",
}
products = []
for n, match in enumerate(matches):
    block = text[match.end():matches[n+1].start() if n+1 < len(matches) else len(text)]
    raw_image = re.search(r"image:(Au|ju|Mu|H|Nu)(?:,|})", block)
    file_image = re.search(r"image:" + tick + r"[^" + tick + r"]+/([^/" + tick + r"]+\.webp)" + tick, block)
    filename = images.get(raw_image.group(1)) if raw_image else file_image.group(1) if file_image else None
    if not filename or not (root / "site/assets/generated" / filename).is_file():
        raise SystemExit(f"Unresolved actual Resolve image for {match.group(1)}.")
    description = re.search("description:" + tick + "([^" + tick + "]*)" + tick, block)
    products.append({
        "id": match.group(1), "name": match.group(2), "category": match.group(3),
        "price": int(match.group(4)), "image": filename,
        "description": description.group(1) if description else "",
        "source": "packaged-resolve-demo"
    })
if len(products) < 10 or len({p["id"] for p in products}) != len(products):
    raise SystemExit("Catalog extraction incomplete or duplicate products detected; output not updated.")
destination = root / "site/portal/catalog.js"
destination.write_text(
    "/* Generated from Resolve's own bundled demo product catalog. Do not hand edit. */\n"
    + "window.ResolveOriginalCatalog = Object.freeze("
    + json.dumps(products, separators=(",", ":"), ensure_ascii=False)
    + ");\n",
    encoding="utf8"
)
print(f"Synced {len(products)} Resolve demo products to {destination.relative_to(root)}")
