#!/usr/bin/env python3
"""Theme refinery harvest — deterministic intake → portable site → APP scaffold → receipts.

Does not promote to production. Does not write secrets. Does not invent D1 repository IDs.
Emits filesystem archaeology + product registry *payloads* for later D1 UPSERT.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
GALLERY = ROOT / "apps" / "theme-gallery-preview" / "themes"
HARVEST_ROOT = ROOT / "work" / "theme-harvest"
APPS_ROOT = ROOT / "apps"
BATCH_ID = f"theme-harvest-{datetime.now(timezone.utc).strftime('%Y%m%d')}"

SKIP_DIR_NAMES = {
    "node_modules",
    ".git",
    ".wrangler",
    ".next",
    ".turbo",
    ".cache",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
    ".scratch",
    ".output",
}
SKIP_FILE_GLOBS = {
    ".env",
    ".env.local",
    ".env.cloudflare",
    "credentials.json",
    "*.pem",
    "*.p12",
    "*.key",
    ".DS_Store",
    "*.bak",
    "*.map",
}
SECRET_NAME_RE = re.compile(
    r"(^|/)(\.env|\.env\..*|.*secret.*|.*credential.*|.*token.*|wrangler\.toml\.local)(/|$)",
    re.I,
)
# Inline credentials that sometimes appear in donor HTML/docs (never ship these).
SECRET_INLINE_RES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bre_[A-Za-z0-9_]{16,}\b"), "[REDACTED_RESEND_API_KEY]"),
    (re.compile(r"\bsk_live_[A-Za-z0-9]{16,}\b"), "[REDACTED_STRIPE_SECRET]"),
    (re.compile(r"\bsk_test_[A-Za-z0-9]{16,}\b"), "[REDACTED_STRIPE_SECRET]"),
    (re.compile(r"\bghp_[A-Za-z0-9]{20,}\b"), "[REDACTED_GITHUB_TOKEN]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED_AWS_ACCESS_KEY]"),
]
SCRUB_TEXT_EXT = {".html", ".htm", ".js", ".mjs", ".cjs", ".json", ".md", ".txt", ".css"}
HTML_EXT = {".html", ".htm"}
ASSET_EXT = {".css", ".js", ".mjs", ".cjs", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".woff", ".woff2", ".ttf", ".ico", ".json"}


def scrub_text(text: str) -> str:
    for pat, repl in SECRET_INLINE_RES:
        text = pat.sub(repl, text)
    return text


def scrub_file_inplace(path: Path) -> bool:
    if path.suffix.lower() not in SCRUB_TEXT_EXT:
        return False
    try:
        raw = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    cleaned = scrub_text(raw)
    if cleaned == raw:
        return False
    path.write_text(cleaned, encoding="utf-8")
    return True


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def should_skip(path: Path, root: Path) -> bool:
    rel = path.relative_to(root)
    parts = set(rel.parts)
    if parts & SKIP_DIR_NAMES:
        return True
    name = path.name
    if name in SKIP_FILE_GLOBS or name.startswith(".env"):
        return True
    if SECRET_NAME_RE.search(str(rel).replace("\\", "/")):
        return True
    if path.is_file() and path.suffix.lower() in {".pem", ".p12", ".key"}:
        return True
    return False


def load_gallery_themes() -> list[dict[str, Any]]:
    themes = []
    for d in sorted(GALLERY.iterdir()):
        meta_path = d / "theme.json"
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text())
        meta["_gallery_dir"] = str(d)
        themes.append(meta)
    return themes


def resolve_donor(meta: dict[str, Any]) -> Path:
    internal = meta.get("_internal") or {}
    source = internal.get("source")
    if source and Path(source).exists():
        return Path(source)
    gallery_site = Path(meta["_gallery_dir"]) / "site"
    if gallery_site.exists():
        return gallery_site
    raise FileNotFoundError(f"No donor for {meta.get('slug')}")


def find_html_entrypoints(root: Path) -> list[Path]:
    hits = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if should_skip(p, root):
            continue
        if p.suffix.lower() in HTML_EXT:
            hits.append(p)
    # Prefer shallow index.html
    hits.sort(key=lambda p: (0 if p.name.lower() == "index.html" else 1, len(p.relative_to(root).parts), str(p)))
    return hits


def classify_kind(root: Path, html_count: int) -> dict[str, Any]:
    markers = []
    for name in ("package.json", "wrangler.toml", "wrangler.jsonc", "vite.config.js", "vite.config.ts", "next.config.js", "next.config.mjs"):
        if (root / name).exists() or list(root.rglob(name))[:1]:
            markers.append(name)
    if "next.config.js" in markers or "next.config.mjs" in markers:
        product = "next-app"
    elif "vite.config.js" in markers or "vite.config.ts" in markers:
        product = "vite-spa"
    elif "wrangler.toml" in markers or "wrangler.jsonc" in markers:
        product = "worker-site"
    elif html_count >= 1:
        product = "static-brochure"
    else:
        product = "unknown"
    fingerprints = {
        "brochure site": product == "static-brochure",
        "cms-backed site": any(x in markers for x in ("wrangler.toml", "wrangler.jsonc")),
        "dashboard": any("dashboard" in str(p).lower() for p in root.rglob("*.html")),
        "ecommerce": any(k in str(root).lower() for k in ("shop", "store", "cart")),
    }
    return {"product_guess": product, "markers": markers, "patterns": fingerprints}


class DomAnatomy(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tags: dict[str, int] = {}
        self.ids: list[str] = []
        self.classes: list[str] = []
        self.nav = False
        self.footer = False
        self.forms = 0
        self.images = 0
        self.scripts = 0
        self.links = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tags[tag] = self.tags.get(tag, 0) + 1
        ad = dict(attrs)
        if ad.get("id"):
            self.ids.append(ad["id"])
        if ad.get("class"):
            self.classes.extend(ad["class"].split())
        if tag == "nav" or "nav" in (ad.get("class") or "").lower() or (ad.get("id") or "").lower() == "nav":
            self.nav = True
        if tag == "footer" or "footer" in (ad.get("class") or "").lower():
            self.footer = True
        if tag == "form":
            self.forms += 1
        if tag == "img":
            self.images += 1
        if tag == "script":
            self.scripts += 1
        if tag == "a":
            self.links += 1


def analyze_html(path: Path) -> dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError as e:
        return {"error": str(e)}
    parser = DomAnatomy()
    try:
        parser.feed(text)
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}
    shell = ["PublicShell"]
    children = []
    if parser.nav or "header" in parser.tags:
        children.append("Header/Navigation")
    if any(c for c in parser.classes if "hero" in c.lower()) or "hero" in " ".join(parser.ids).lower():
        children.append("Hero")
    if parser.forms:
        children.append("Forms")
    if parser.footer:
        children.append("Footer")
    if not children:
        children = ["MainContent"]
    return {
        "path": str(path),
        "bytes": path.stat().st_size,
        "tags": dict(sorted(parser.tags.items(), key=lambda kv: (-kv[1], kv[0]))[:20]),
        "forms": parser.forms,
        "images": parser.images,
        "scripts": parser.scripts,
        "links": parser.links,
        "proposed_shell": {"PublicShell": children},
    }


def copy_sanitized(src: Path, dest: Path) -> dict[str, Any]:
    dest.mkdir(parents=True, exist_ok=True)
    copied = 0
    skipped = 0
    warnings: list[str] = []
    file_hashes: list[str] = []
    for path in src.rglob("*"):
        if path.is_dir():
            continue
        if should_skip(path, src):
            skipped += 1
            continue
        rel = path.relative_to(src)
        # Cap huge binary trees
        try:
            size = path.stat().st_size
        except OSError:
            skipped += 1
            continue
        if size > 8 * 1024 * 1024:
            warnings.append(f"skipped large file >8MB: {rel}")
            skipped += 1
            continue
        out = dest / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(path, out)
            if scrub_file_inplace(out):
                warnings.append(f"scrubbed inline secret(s): {rel}")
            copied += 1
            file_hashes.append(sha256_file(out))
        except OSError as e:
            warnings.append(f"copy failed {rel}: {e}")
            skipped += 1
    tree_hash = sha256_bytes("\n".join(sorted(file_hashes)).encode())
    return {"copied": copied, "skipped": skipped, "warnings": warnings, "source_hash": tree_hash}


def make_portable(snapshot: Path, portable: Path, html_files: list[Path], snapshot_root: Path) -> dict[str, Any]:
    """Copy HTML + referenced relative assets into a clean site/ tree."""
    if portable.exists():
        shutil.rmtree(portable)
    portable.mkdir(parents=True)
    pages: list[str] = []
    broken: list[str] = []
    # If donor is already mostly a static site root, prefer mirroring HTML-near assets
    for html in html_files[:40]:
        rel = html.relative_to(snapshot_root)
        # Flatten deep dist/index.html → index.html when sole root index
        target_rel = rel
        parts = list(rel.parts)
        if parts and parts[0] in {"dist", "build", "out", "static", "public"} and len(parts) > 1:
            target_rel = Path(*parts[1:])
        out = portable / target_rel
        out.parent.mkdir(parents=True, exist_ok=True)
        text = html.read_text(encoding="utf-8", errors="ignore")
        # Rewrite absolute file:// and machine paths lightly; scrub credentials
        text2 = re.sub(r"file://[^\s\"')]+", "#", text)
        text2 = re.sub(r"/Users/[^\s\"')]+", "#", text2)
        text2 = scrub_text(text2)
        out.write_text(text2, encoding="utf-8")
        pages.append(str(target_rel).replace("\\", "/"))
        # copy sibling assets directory heuristically
        for asset_dir_name in ("assets", "css", "js", "images", "img", "fonts", "static"):
            sibling = html.parent / asset_dir_name
            if sibling.is_dir():
                dest_dir = out.parent / asset_dir_name
                if not dest_dir.exists():
                    shutil.copytree(
                        sibling,
                        dest_dir,
                        ignore=shutil.ignore_patterns("node_modules", ".git", "*.map"),
                        dirs_exist_ok=True,
                    )
    # Ensure at least index.html
    if not pages:
        broken.append("no html pages copied")
    elif not any(p == "index.html" or p.endswith("/index.html") for p in pages):
        # copy first html as index.html convenience
        first = portable / pages[0]
        if first.exists():
            shutil.copy2(first, portable / "index.html")
            pages.insert(0, "index.html")
    return {"pages": pages, "broken": broken, "portable_root": str(portable)}


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def scaffold_app(slug: str, meta: dict[str, Any], portable: Path, findings: dict[str, Any], batch_id: str = BATCH_ID) -> Path:
    app_dir = APPS_ROOT / slug
    app_dir.mkdir(parents=True, exist_ok=True)
    site_dest = app_dir / "frontend" / "public"
    if site_dest.exists():
        shutil.rmtree(site_dest)
    shutil.copytree(portable, site_dest)
    agentsam = app_dir / ".agentsam"
    agentsam.mkdir(exist_ok=True)
    app_json = {
        "schema": "agentsam.app.v1",
        "id": slug,
        "name": meta.get("name") or slug,
        "kind": "theme-app",
        "status": "scaffolded",
        "package": meta.get("package") or f"@inneranimalmedia/theme-{slug}",
        "gallery_path": f"apps/theme-gallery-preview/themes/{slug}",
        "canonical_path": f"apps/{slug}",
        "preview": {"kind": "static", "root": "frontend/public"},
        "features_proposed": findings.get("capabilities_proposed") or [],
        "harvest_batch": batch_id,
    }
    write_json(agentsam / "app.json", app_json)
    pkg = {
        "name": f"@inneranimalmedia/app-{slug}",
        "version": "0.1.0",
        "private": True,
        "description": f"Scaffolded APP from theme harvest: {meta.get('name') or slug}",
        "type": "module",
        "scripts": {
            "preview": "python3 -m http.server 4177 --directory frontend/public"
        },
    }
    write_json(app_dir / "package.json", pkg)
    docs = app_dir / "docs"
    docs.mkdir(exist_ok=True)
    (docs / "getting-started.md").write_text(
        f"# {meta.get('name') or slug}\n\n"
        f"Scaffolded by `{batch_id}` from gallery/donor harvest.\n\n"
        f"Preview: `npm run preview` in `apps/{slug}`.\n\n"
        "Status: **scaffolded** — design preserved from donor; plumbing not yet replaced.\n",
        encoding="utf-8",
    )
    (docs / "features.md").write_text(
        "# Features (proposed)\n\n"
        + "\n".join(f"- `{c}`" for c in (findings.get("capabilities_proposed") or ["theme.storefront.shell"]))
        + "\n",
        encoding="utf-8",
    )
    ref = app_dir / "reference"
    ref.mkdir(exist_ok=True)
    write_json(
        ref / "provenance.json",
        {
            "harvest_batch": batch_id,
            "donor_name": meta.get("name"),
            "source_path": (meta.get("_internal") or {}).get("source"),
            "gallery_path": f"apps/theme-gallery-preview/themes/{slug}",
            "package": meta.get("package"),
        },
    )
    # Minimal help mirror
    help_dir = app_dir / "help"
    help_dir.mkdir(exist_ok=True)
    (help_dir / "index.html").write_text(
        f"<!doctype html><meta charset=utf-8><title>{meta.get('name') or slug} Help</title>"
        f"<h1>{meta.get('name') or slug}</h1><p>Harvested help stub. Refine via AgentSam.</p>"
        f"<ul><li><a href='../docs/getting-started.md'>Getting started</a></li>"
        f"<li><a href='../docs/features.md'>Features</a></li></ul>",
        encoding="utf-8",
    )
    return app_dir


def propose_capabilities(findings: dict[str, Any], anatomy: list[dict[str, Any]]) -> list[str]:
    caps = ["theme.storefront.shell"]
    if any(a.get("forms") for a in anatomy):
        caps.append("forms.leads")
    if any(a.get("images", 0) > 3 for a in anatomy):
        caps.append("cms.media")
    if len(anatomy) >= 2:
        caps.append("cms.pages")
    if findings.get("product_guess") in {"worker-site", "vite-spa", "next-app"}:
        caps.append("deploy.receipt")
    return sorted(set(caps))


def product_payload(meta: dict[str, Any], status: str, source_hash: str, caps: list[str], batch_id: str = BATCH_ID) -> dict[str, Any]:
    slug = meta["slug"]
    return {
        "slug": slug,
        "name": meta.get("name") or slug,
        "kind": "app",
        "status": status,
        "repository_id": None,
        "canonical_path": f"apps/{slug}",
        "package_name": meta.get("package") or f"@inneranimalmedia/theme-{slug}",
        "metadata": {
            "origin": "machine_harvest",
            "donor_name": meta.get("name"),
            "source_path": (meta.get("_internal") or {}).get("source"),
            "harvest_batch": batch_id,
            "normalization_state": "portable-preview" if status == "scaffolded" else "fingerprinted",
            "source_hash": source_hash,
            "app_manifest": f"apps/{slug}/.agentsam/app.json",
            "help_root": f"apps/{slug}/docs/",
            "preview_kind": "static",
            "package": meta.get("package"),
            "gallery_path": f"apps/theme-gallery-preview/themes/{slug}",
            "capabilities": caps,
        },
        "relationships": [
            {"relationship_type": "packaged_as", "target_type": "sdk-package", "target_slug": f"theme-{slug}"},
            {"relationship_type": "depends_on", "target_type": "capability", "target_slug": "theme.storefront.shell"},
            {"relationship_type": "sourced_from", "target_type": "gallery-theme", "target_slug": slug},
        ],
        "_note": "repository_id must be resolved against live code_repositories before D1 UPSERT",
    }


def harvest_one(meta: dict[str, Any], batch_id: str = BATCH_ID) -> dict[str, Any]:
    slug = meta["slug"]
    out = HARVEST_ROOT / slug
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    warnings: list[str] = []
    donor = resolve_donor(meta)
    snapshot = out / "source-snapshot"
    copy_stats = copy_sanitized(donor, snapshot)
    warnings.extend(copy_stats["warnings"])
    html_files = find_html_entrypoints(snapshot)
    if not html_files:
        # fall back to gallery site mount
        gallery_site = Path(meta["_gallery_dir"]) / "site"
        if gallery_site.exists():
            warnings.append("donor had no HTML; using gallery site/ mount")
            shutil.rmtree(snapshot)
            copy_stats = copy_sanitized(gallery_site, snapshot)
            html_files = find_html_entrypoints(snapshot)
    classification = classify_kind(snapshot, len(html_files))
    anatomy = [analyze_html(p) for p in html_files[:12]]
    caps = propose_capabilities(classification, anatomy)
    findings = {
        "slug": slug,
        "captured_at": utc_now(),
        "donor": str(donor),
        "html_entrypoints": [str(p.relative_to(snapshot)) for p in html_files[:50]],
        "html_count": len(html_files),
        "classification": classification,
        "anatomy": anatomy,
        "capabilities_proposed": caps,
        "pages_proposed": meta.get("pages") or [],
        "features_declared": meta.get("features") or [],
    }
    portable_info = make_portable(snapshot, out / "site", html_files, snapshot)
    findings["portable"] = portable_info
    intake = {
        "schema": "agentsam.theme-refinery.intake.v1",
        "batch_id": batch_id,
        "slug": slug,
        "donor_name": meta.get("name"),
        "donor_path": str(donor),
        "gallery_dir": meta.get("_gallery_dir"),
        "copy": {k: copy_stats[k] for k in ("copied", "skipped", "source_hash")},
        "captured_at": utc_now(),
    }
    provenance = {
        "origin": "machine_harvest",
        "harvest_batch": batch_id,
        "donor_name": meta.get("name"),
        "source_path": str(donor),
        "source_hash": copy_stats["source_hash"],
        "package": meta.get("package"),
        "gallery_path": f"apps/theme-gallery-preview/themes/{slug}",
        "source_untouched": True,
    }
    write_json(out / "intake.json", intake)
    write_json(out / "findings.json", findings)
    write_json(out / "warnings.json", {"warnings": warnings})
    write_json(out / "provenance.json", provenance)

    app_dir = scaffold_app(slug, meta, out / "site", findings, batch_id)
    # preview package (file pointers; screenshots optional later)
    preview = out / "preview"
    preview.mkdir(exist_ok=True)
    write_json(
        preview / "preview.json",
        {
            "slug": slug,
            "demo": f"apps/{slug}/frontend/public/",
            "pages": portable_info.get("pages") or [],
            "desktop": None,
            "mobile": None,
            "note": "Screenshots deferred — static demo path registered",
        },
    )
    # symlink-ish copy of public into preview/demo for gallery consumers
    demo = preview / "demo"
    if demo.exists():
        shutil.rmtree(demo)
    shutil.copytree(out / "site", demo)

    product = product_payload(meta, "scaffolded", copy_stats["source_hash"], caps, batch_id)
    write_json(out / "product-registry-payload.json", product)

    # Update gallery theme.json harvest pointer
    gallery_meta_path = Path(meta["_gallery_dir"]) / "theme.json"
    gmeta = json.loads(gallery_meta_path.read_text())
    gmeta["installable"] = True
    gmeta["package"] = meta.get("package") or f"@inneranimalmedia/theme-{slug}"
    gmeta["_internal"] = {
        **(gmeta.get("_internal") or {}),
        "normalization": "scaffolded",
        "harvest_batch": batch_id,
        "harvest_path": f"work/theme-harvest/{slug}",
        "app_path": f"apps/{slug}",
        "source_hash": copy_stats["source_hash"],
    }
    write_json(gallery_meta_path, gmeta)

    # Enrich theme package with harvest pointer
    theme_pkg = ROOT / "packages" / f"theme-{slug}" / "src" / "harvest.json"
    write_json(
        theme_pkg,
        {
            "harvest_batch": batch_id,
            "app_path": f"apps/{slug}",
            "harvest_path": f"work/theme-harvest/{slug}",
            "status": "scaffolded",
            "source_hash": copy_stats["source_hash"],
            "capabilities": caps,
        },
    )

    return {
        "slug": slug,
        "status": "scaffolded",
        "app_path": str(app_dir.relative_to(ROOT)),
        "harvest_path": str(out.relative_to(ROOT)),
        "pages": len(portable_info.get("pages") or []),
        "html_count": len(html_files),
        "warnings": len(warnings),
        "product": product,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run theme refinery harvest")
    parser.add_argument("--slug", action="append", help="Limit to slug(s)")
    parser.add_argument("--batch-id", default=None)
    args = parser.parse_args()
    batch_id = args.batch_id or BATCH_ID

    themes = load_gallery_themes()
    if args.slug:
        wanted = set(args.slug)
        themes = [t for t in themes if t.get("slug") in wanted]

    # Bind batch into harvest via env for nested helpers
    os.environ["THEME_HARVEST_BATCH"] = batch_id

    results = []
    failures = []
    for meta in themes:
        slug = meta.get("slug")
        print(f"==> harvesting {slug}", flush=True)
        try:
            results.append(harvest_one(meta, batch_id=batch_id))
            print(f"    ok pages={results[-1]['pages']} app={results[-1]['app_path']}", flush=True)
        except Exception as e:  # noqa: BLE001
            failures.append({"slug": slug, "error": str(e)})
            print(f"    FAIL {e}", flush=True)

    receipt = {
        "schema_version": 1,
        "batch_id": batch_id,
        "captured_at": utc_now(),
        "candidates": {
            "discovered": len(themes),
            "from_gallery": len(themes),
            "from_company_map": 0,
            "from_apps_table": 0,
            "from_disk": 0,
            "from_existing_products": 0,
        },
        "products": {
            "matched": 0,
            "registered": len(results),
            "updated": 0,
            "unchanged": 0,
            "ambiguous": [],
            "duplicates": [],
        },
        "repositories": {"resolved": 0, "failures": ["D1 resolve deferred — payloads emitted without repository_id"]},
        "relationships": {"added": len(results) * 3, "updated": 0, "unchanged": 0},
        "evidence": {"snapshots_written": len(results)},
        "artifacts": {"registered": len(results)},
        "quality_reports": {"generated": 0},
        "cms": {"themes_discovered": 0, "component_templates_extracted": 0},
        "capabilities_linked": {"tools": 0, "workflows": 0, "skills": 0, "hooks": 0},
        "promotions": [{"slug": r["slug"], "from": "prototype", "to": "scaffolded"} for r in results],
        "failures": [f["error"] for f in failures],
        "skipped": [],
        "results": results,
        "d1_note": "Filesystem harvest complete. Apply product-registry-payload.json via UPSERT after resolving code_repositories.",
    }
    HARVEST_ROOT.mkdir(parents=True, exist_ok=True)
    write_json(HARVEST_ROOT / "reconciliation-receipt.json", receipt)
    write_json(HARVEST_ROOT / "products-registry-batch.json", [r["product"] for r in results])
    print(json.dumps({"ok": not failures, "harvested": len(results), "failed": len(failures), "receipt": str(HARVEST_ROOT / "reconciliation-receipt.json")}, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
