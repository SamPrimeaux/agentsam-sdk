#!/usr/bin/env python3
"""AgentSam theme prebuild remaster pipeline.

The pipeline coordinates canonical theme/package identity, generated media,
and SEO projections. Historical customer identity is intentionally not stored
in this distributable tooling.

Audit and plan modes are free and deterministic. AI calls require --execute-ai.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from remaster_ai import (
    RemasterAIError,
    generate_image,
    generate_text_json,
    optimize_to_webp,
    stock_prompt,
)

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = Path(__file__).with_name("remaster_manifest.json")
GALLERY_ROOT = ROOT / "apps/theme-gallery-preview"
THEMES_ROOT = GALLERY_ROOT / "themes"
CATALOG_PATH = GALLERY_ROOT / "data/catalog.json"
GALLERY_COPY_PATH = GALLERY_ROOT / "data/gallery-copy.json"
REGISTRY_PATH = ROOT / "packages/theme-scenes/src/registry.js"

TEXT_SUFFIXES = {
    ".html", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
    ".json", ".md", ".txt", ".webmanifest", ".xml", ".svg"
}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"}

FEATURES = {
    "cypress": ["Events", "Groups", "Giving", "Story-driven pages"],
    "violet": ["Campaign CTAs", "Impact stories", "Donations", "Participation paths"],
    "grove": ["Project gallery", "Process", "Reviews", "Estimate capture"],
    "ember": ["Collections", "Editorial stories", "Community", "Launch moments"],
    "forge": ["Estimate forms", "Service areas", "Project proof", "Mobile-first"],
    "harbor": ["Lead capture", "Services", "Resources", "Trust signals"],
    "summit": ["Services", "Case studies", "Media", "Multilingual-ready"],
    "resolve": ["Lookbooks", "Sticky PDP rails", "Bundles", "Stories"],
}

PAGES = {
    "cypress": ["Home", "Visit", "Events", "Groups", "Mission", "Give"],
    "violet": ["Home", "Campaigns", "Stories", "Impact", "Get involved", "Donate"],
    "grove": ["Home", "Services", "Projects", "Process", "Reviews", "Contact"],
    "ember": ["Home", "Shop", "Collections", "Story", "Community", "Journal"],
    "forge": ["Home", "Services", "Projects", "Service areas", "Reviews", "Estimate"],
    "harbor": ["Home", "Services", "About", "Resources", "FAQ", "Contact"],
    "summit": ["Home", "Services", "Work", "About", "Journal", "Contact"],
    "resolve": ["Home", "Shop", "Lookbook", "Product", "Stories", "Journal"],
}


def load_manifest() -> dict[str, Any]:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def theme_name(theme: dict[str, Any]) -> str:
    return str(theme["id"]).replace("-", " ").title()


def by_id(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {t["id"]: t for t in manifest["themes"]}


def select_themes(manifest: dict[str, Any], value: str) -> list[dict[str, Any]]:
    if value in {"all", "*"}:
        return list(manifest["themes"])
    ids = [v.strip() for v in value.split(",") if v.strip()]
    lookup = by_id(manifest)
    missing = [v for v in ids if v not in lookup]
    if missing:
        raise SystemExit("unknown theme(s): " + ", ".join(missing))
    return [lookup[v] for v in ids]


def canonical_gallery(theme: dict[str, Any]) -> Path:
    return THEMES_ROOT / theme["id"]


def current_gallery(theme: dict[str, Any]) -> Path:
    return canonical_gallery(theme)

def canonical_package(theme: dict[str, Any]) -> Path:
    return ROOT / theme["package_dir"]


def current_package(theme: dict[str, Any]) -> Path | None:
    canonical = canonical_package(theme)
    return canonical if canonical.exists() else None

def iter_text_files(*roots: Path):
    seen: set[Path] = set()
    for root in roots:
        if not root or not root.exists():
            continue
        if root.is_file():
            candidates = [root]
        else:
            candidates = root.rglob("*")
        for path in candidates:
            if not path.is_file() or path in seen:
                continue
            if path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            if any(part in {"node_modules", ".git", "dist"} for part in path.parts):
                continue
            seen.add(path)
            yield path


def write_text(path: Path, text: str, apply: bool) -> bool:
    old = path.read_text(encoding="utf-8", errors="ignore") if path.exists() else None
    if old == text:
        return False
    if apply:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return True


def write_json(path: Path, payload: Any, apply: bool) -> bool:
    return write_text(path, json.dumps(payload, indent=2, ensure_ascii=False) + "\n", apply)


def replacements_for(theme: dict[str, Any]) -> dict[str, str]:
    # Canonical builds are already sterilized. Keeping historical replacement
    # vocabularies here would itself preserve customer identity in the SDK.
    return {}

def scan_terms(theme: dict[str, Any], roots: list[Path]) -> list[dict[str, Any]]:
    # Customer-specific tokens are intentionally not stored in the remaster
    # manifest. Repository-wide privacy validation lives in verify_sterile.py.
    return []

def scan_external_media(roots: list[Path]) -> list[dict[str, str]]:
    pattern = re.compile(
        r"""(?:src|href|poster|data-src)\s*=\s*["'](https?://[^"']+)|url\(["']?(https?://[^)"']+)""",
        re.I,
    )
    rows: list[dict[str, str]] = []
    for path in iter_text_files(*roots):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for match in pattern.finditer(text):
            url = match.group(1) or match.group(2)
            if not url:
                continue
            if re.search(r"\.(?:png|jpe?g|webp|avif|gif|svg)(?:[?#]|$)", url, re.I):
                rows.append({"path": str(path.relative_to(ROOT)), "url": url})
    return rows


def audit(manifest: dict[str, Any], selected: list[dict[str, Any]]) -> dict[str, Any]:
    report: dict[str, Any] = {
        "schema": "agentsam.theme-remaster.audit.v1",
        "themes": {},
    }
    for theme in selected:
        roots = [p for p in [current_package(theme), current_gallery(theme)] if p]
        report["themes"][theme["id"]] = {
            "public_identity": theme_name(theme),
            "demo_brand": theme["demo_brand"],
            "customer_identity_findings": scan_terms(theme, roots),
            "external_media": scan_external_media(roots),
            "package_path": str(current_package(theme).relative_to(ROOT)) if current_package(theme) else None,
            "gallery_path": str(current_gallery(theme).relative_to(ROOT)) if current_gallery(theme).exists() else None,
        }
    return report


def move_path(source: Path, destination: Path, apply: bool) -> bool:
    if not source.exists() or source == destination:
        return False
    if destination.exists():
        return False
    if apply:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(destination))
    return True


def update_package_metadata(theme: dict[str, Any], package_dir: Path, apply: bool) -> int:
    changed = 0
    package_json = package_dir / "package.json"
    if package_json.exists():
        data = json.loads(package_json.read_text(encoding="utf-8"))
        data["name"] = theme["package_name"]
        data["description"] = theme["description"]
        agentsam = dict(data.get("agentsam") or {})
        for key in ("lineage", "legacyPackageName", "legacySlug", "donor", "sourcePath"):
            agentsam.pop(key, None)
        agentsam.update({
            "kind": "theme",
            "slug": theme["id"],
            "canonicalId": theme["id"],
            "family": theme["family"],
            "normalization": "package_ready",
            "installable": True,
            "portable": True,
            "prebuildRoot": "site",
        })
        data["agentsam"] = agentsam
        repository = dict(data.get("repository") or {})
        if repository:
            repository["directory"] = theme["package_dir"]
            data["repository"] = repository
        changed += int(write_json(package_json, data, apply))

    readme = f"""# {theme['package_name']}

**{theme_name(theme)}** is an AgentSam prebuild for {theme['eyebrow'].lower()}.

{theme['tagline']}

{theme['description']}

Demo identity: **{theme['demo_brand']}**. The demo content is fictional and exists to show the layout, interaction, and content system without carrying customer branding forward.

The complete built platform ships in `site/`; installation does not depend on the AgentSam gallery or a sync step.
"""
    changed += int(write_text(package_dir / "README.md", readme, apply))

    index_js = package_dir / "src/index.js"
    if index_js.exists():
        text = index_js.read_text(encoding="utf-8", errors="ignore")
        text = re.sub(r'("slug"\s*:\s*)".*?"', rf'\1"{theme["id"]}"', text, count=1)
        text = re.sub(r'("displayName"\s*:\s*)".*?"', rf'\1"{theme_name(theme)}"', text, count=1)
        text = re.sub(
            r'("description"\s*:\s*)".*?"',
            lambda m: m.group(1) + json.dumps(theme["description"]),
            text,
            count=1,
        )
        changed += int(write_text(index_js, text, apply))
    return changed


def scrub_tree(theme: dict[str, Any], roots: list[Path], apply: bool) -> int:
    replacements = replacements_for(theme)
    changed = 0
    for path in iter_text_files(*roots):
        text = path.read_text(encoding="utf-8", errors="ignore")
        new = text
        for old, replacement in replacements.items():
            new = re.sub(re.escape(old), replacement, new, flags=re.I)
        changed += int(write_text(path, new, apply))
    return changed


def ensure_theme_json(theme: dict[str, Any], gallery_dir: Path, apply: bool) -> int:
    path = gallery_dir / "theme.json"
    previous = {}
    if path.exists():
        try:
            previous = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            previous = {}
    payload = {
        **previous,
        "slug": theme["id"],
        "appId": theme["id"],
        "name": theme_name(theme),
        "demoBrand": theme["demo_brand"],
        "eyebrow": theme["eyebrow"],
        "category": theme["category"],
        "family": theme["family"],
        "tagline": theme["tagline"],
        "description": theme["description"],
        "bestFor": theme["best_for"],
        "features": FEATURES[theme["id"]],
        "pages": PAGES[theme["id"]],
        "preview": {
            "kind": "live",
            "card": f"/themes/{theme['id']}/demo/",
            "desktop": f"/themes/{theme['id']}/demo/",
            "mobile": f"/themes/{theme['id']}/demo/",
            "demoUrl": f"/themes/{theme['id']}/demo/",
        },
        "installable": True,
        "portable": True,
        "prebuildRoot": "site",
        "package": theme["package_name"],
    }
    payload.pop("_internal", None)
    return int(write_json(path, payload, apply))


def normalize_root_package(manifest: dict[str, Any], apply: bool) -> int:
    path = ROOT / "package.json"
    data = json.loads(path.read_text(encoding="utf-8"))

    workspaces = list(data.get("workspaces") or [])
    for theme in manifest["themes"]:
        if theme["package_dir"] not in workspaces:
            workspaces.append(theme["package_dir"])
    data["workspaces"] = workspaces

    exports = dict(data.get("exports") or {})
    for theme in manifest["themes"]:
        exports[f"./theme/{theme['id']}"] = f"./{theme['package_dir']}/src/index.js"
    data["exports"] = exports

    return int(write_json(path, data, apply))

def scrub_public_registry(manifest: dict[str, Any], apply: bool) -> int:
    if not REGISTRY_PATH.exists():
        return 0
    text = REGISTRY_PATH.read_text(encoding="utf-8")
    new = re.sub(r'^\s*donor:\s*"[^"]+",\s*$', "", text, flags=re.M)
    return int(write_text(REGISTRY_PATH, new, apply))

def write_private_provenance(manifest: dict[str, Any], apply: bool) -> int:
    # Historical customer lineage is deliberately excluded from the SDK tree.
    return 0

def normalize(manifest: dict[str, Any], selected: list[dict[str, Any]], apply: bool) -> dict[str, Any]:
    actions: list[str] = []
    for theme in selected:
        pkg = canonical_package(theme)
        gallery = canonical_gallery(theme)

        if pkg.exists() or not apply:
            if update_package_metadata(theme, pkg, apply):
                actions.append(f"normalize package metadata {theme['id']}")
        if gallery.exists() or not apply:
            if ensure_theme_json(theme, gallery, apply):
                actions.append(f"normalize gallery metadata {theme['id']}")

    if normalize_root_package(manifest, apply):
        actions.append("normalize root workspace/export paths")
    if scrub_public_registry(manifest, apply):
        actions.append("sanitize public theme registry")

    return {"apply": apply, "actions": actions}

def copy_prompt(theme: dict[str, Any]) -> str:
    return f"""
You are writing public product copy for an AgentSam website prebuild.

Canonical theme name: {theme_name(theme)}
Fictional demo brand: {theme['demo_brand']}
Category: {theme['category']}
Family: {theme['family']}
Voice: {theme['voice']}
Current direction: {theme['description']}
Best for: {", ".join(theme['best_for'])}

Return strict JSON only with:
headline, subheadline, description, card_blurb, seo_title, seo_description,
keywords (array of 6-10 phrases), hero_cta, secondary_cta, image_notes (array of 4).

Rules:
- Give it personality. Avoid generic SaaS/template-store filler.
- Never mention a donor, client, historical customer, or real company.
- No unverifiable awards, rankings, customer counts, or performance claims.
- Do not say "perfect for" or "revolutionary".
- seo_title <= 60 characters where practical.
- seo_description 130-160 characters.
- card_blurb should be punchy and under 150 characters.
- Copy should describe the prebuild's behavior and design, not pretend the fictional demo is a real business.
""".strip()


def generate_copy_for_theme(theme: dict[str, Any], provider: str, execute_ai: bool) -> dict[str, Any]:
    gallery = canonical_gallery(theme)
    target = gallery / "copy.generated.json"
    if not execute_ai:
        return {
            "would_generate": str(target.relative_to(ROOT)),
            "provider": provider,
        }
    payload = generate_text_json(copy_prompt(theme), provider)
    payload["theme"] = theme["id"]
    payload["demo_brand"] = theme["demo_brand"]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload


def generated_copy(theme: dict[str, Any]) -> dict[str, Any]:
    path = canonical_gallery(theme) / "copy.generated.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def catalog_theme(theme: dict[str, Any]) -> dict[str, Any]:
    copy = generated_copy(theme)
    description = copy.get("description") or theme["description"]
    card_blurb = copy.get("card_blurb") or theme["tagline"]
    seo_title = copy.get("seo_title") or f"{theme_name(theme)} — AgentSam Prebuild"
    seo_description = copy.get("seo_description") or description
    return {
        "slug": theme["id"],
        "appId": theme["id"],
        "name": theme_name(theme),
        "demoBrand": theme["demo_brand"],
        "eyebrow": theme["eyebrow"],
        "category": theme["category"],
        "family": theme["family"],
        "tagline": theme["tagline"],
        "cardBlurb": card_blurb,
        "description": description,
        "bestFor": theme["best_for"],
        "features": FEATURES[theme["id"]],
        "pages": PAGES[theme["id"]],
        "preview": {
            "kind": "live",
            "card": f"/themes/{theme['id']}/demo/",
            "desktop": f"/themes/{theme['id']}/demo/",
            "mobile": f"/themes/{theme['id']}/demo/",
            "demoUrl": f"/themes/{theme['id']}/demo/",
        },
        "seo": {
            "title": seo_title,
            "description": seo_description,
            "keywords": copy.get("keywords") or [theme["category"], theme["family"], *theme["best_for"]],
            "ogImage": f"/themes/{theme['id']}/demo/assets/generated/social-card.webp",
        },
        "installable": True,
        "portable": True,
        "package": theme["package_name"],
        "prebuildRoot": "site",
    }


def write_catalog(manifest: dict[str, Any], apply: bool) -> dict[str, Any]:
    payload = {
        "schema": "agentsam.themes.v2",
        "themes": [catalog_theme(theme) for theme in manifest["themes"]],
    }
    gallery_copy = {
        "schema": "agentsam.theme-gallery-copy.v1",
        **manifest["gallery"],
        "theme_count": len(manifest["themes"]),
    }
    return {
        "catalog_changed": write_json(CATALOG_PATH, payload, apply),
        "gallery_copy_changed": write_json(GALLERY_COPY_PATH, gallery_copy, apply),
    }


def make_mark_svg(theme: dict[str, Any]) -> str:
    digest = hashlib.sha256(theme["id"].encode()).hexdigest()
    angle = int(digest[:2], 16) % 45
    a, b = theme["palette"][0], theme["palette"][2]
    label = theme_name(theme)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{label}">
<rect width="64" height="64" rx="16" fill="{a}"/>
<g transform="translate(32 32) rotate({angle})" fill="none" stroke="{b}" stroke-width="4">
  <rect x="-14" y="-14" width="28" height="28" rx="7"/>
  <path d="M-14 0H14M0-14V14"/>
</g>
</svg>"""


def make_mark_png(theme: dict[str, Any], destination: Path, size: int) -> None:
    from PIL import Image, ImageDraw

    def rgb(value: str) -> tuple[int, int, int]:
        value = value.lstrip("#")
        return tuple(int(value[i:i+2], 16) for i in (0, 2, 4))

    background = rgb(theme["palette"][0])
    accent = rgb(theme["palette"][2])
    image = Image.new("RGB", (size, size), background)
    draw = ImageDraw.Draw(image)
    inset = max(10, size // 4)
    width = max(3, size // 18)
    radius = max(8, size // 10)
    draw.rounded_rectangle(
        (inset, inset, size - inset, size - inset),
        radius=radius,
        outline=accent,
        width=width,
    )
    center = size // 2
    draw.line((inset, center, size - inset, center), fill=accent, width=width)
    draw.line((center, inset, center, size - inset), fill=accent, width=width)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "PNG", optimize=True)


def _is_generated_media_ref(source: str) -> bool:
    low = source.lower()
    return (
        "assets/generated/" in low
        or "agentsam.inneranimalmedia.com/themes/" in low
        or low.startswith("data:")
    )


def _looks_like_mark(source: str) -> bool:
    low = source.lower()
    return any(token in low for token in ("logo", "wordmark", "brandmark", "favicon", "app-icon"))


def _asset_context(source: str, file_name: str, alt: str = "") -> tuple[str, str, str]:
    low = f"{source} {file_name} {alt}".lower()
    if _looks_like_mark(source):
        return "brand mark", alt or "fictional demo brand mark", "1:1"
    if any(token in low for token in ("hero", "banner", "cover", "masthead", "background")):
        return "hero / background image", alt or Path(file_name).stem.replace("-", " "), "16:9"
    if any(token in low for token in ("portrait", "team", "person", "profile")):
        return "editorial portrait", alt or Path(file_name).stem.replace("-", " "), "4:5"
    return "editorial content image", alt or Path(file_name).stem.replace("-", " "), "3:2"


def media_slots(theme: dict[str, Any], max_images: int) -> list[dict[str, Any]]:
    """Discover unique visual source references across HTML, CSS, and built JS.

    Donor builds are heterogeneous: some use plain <img>, some CSS backgrounds,
    and bundled apps may retain string URLs in JS. We replace by source URL rather
    than DOM position so one generated asset can replace every duplicate use.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError as exc:
        raise SystemExit("pip install beautifulsoup4") from exc

    site = canonical_gallery(theme) / "site"
    if not site.exists():
        return []

    candidates: list[tuple[str, str, str]] = []
    seen: set[str] = set()

    # First collect semantic <img> references so their alt text informs prompts.
    for html in sorted(site.rglob("*.html")):
        text = html.read_text(encoding="utf-8", errors="ignore")
        soup = BeautifulSoup(text, "html.parser")
        for img in soup.find_all("img"):
            source = str(img.get("src") or "").strip()
            if not source or _is_generated_media_ref(source) or source in seen:
                continue
            if source.startswith(("blob:", "javascript:")):
                continue
            seen.add(source)
            candidates.append((source, str(html.relative_to(site)), str(img.get("alt") or "").strip()))

    # Then catch CSS backgrounds, externally hosted stock/customer media, and
    # unbundled /src/assets references preserved inside compiled JS.
    external = re.compile(r"""https?://[^\s"'()<>{}]+""", re.I)
    source_asset = re.compile(r"""/src/assets/images/[^\s"'()<>{}]+?\.(?:png|jpe?g|webp|avif|gif)""", re.I)

    for path in iter_text_files(site):
        try:
            relative_parts = path.relative_to(site).parts
        except ValueError:
            relative_parts = path.parts
        if len(relative_parts) >= 2 and relative_parts[0] == "assets" and relative_parts[1] == "generated":
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for pattern in (external, source_asset):
            for match in pattern.finditer(text):
                source = match.group(0).rstrip(";,")
                if pattern is external:
                    low = source.lower()
                    is_media = (
                        any(ext in low for ext in (".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"))
                        or "images.unsplash.com/" in low
                        or "cdn.shopify.com/" in low
                        or ".r2.dev/" in low
                        or "assets.meauxxx.com/" in low
                    )
                    if not is_media:
                        continue
                if _is_generated_media_ref(source) or source in seen:
                    continue
                seen.add(source)
                candidates.append((source, str(path.relative_to(site)), ""))

    # Collapse query-string variants of the same remote asset. Donor sites
    # often request the same image at several widths; one replacement should
    # cover all of them instead of paying to generate near-duplicates.
    grouped: dict[str, dict[str, Any]] = {}
    for source, file_name, alt in candidates:
        if source.startswith(("http://", "https://")):
            parts = urlsplit(source)
            identity = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
        else:
            identity = source
        row = grouped.get(identity)
        if row is None:
            row = {
                "source": source,
                "aliases": [],
                "file": file_name,
                "alt": alt,
            }
            grouped[identity] = row
        elif source != row["source"] and source not in row["aliases"]:
            row["aliases"].append(source)

    slots: list[dict[str, Any]] = []
    generated_count = 0
    for identity, row in grouped.items():
        source = row["source"]
        label, context, aspect = _asset_context(source, row["file"], row["alt"])
        is_mark = _looks_like_mark(source)
        if not is_mark and generated_count >= max_images:
            continue
        if not is_mark:
            generated_count += 1
        key_seed = f"{theme['id']}:{identity}"
        slot_id = hashlib.sha1(key_seed.encode()).hexdigest()[:10]
        slots.append({
            "kind": "mark" if is_mark else "source-ref",
            "file": row["file"],
            "source": source,
            "aliases": row["aliases"],
            "slot": f"media-{slot_id}",
            "label": label,
            "context": context[:180],
            "aspect_ratio": aspect,
        })
    return slots


def patch_media_refs(theme: dict[str, Any], slots: list[dict[str, Any]], apply: bool) -> int:
    site = canonical_gallery(theme) / "site"
    replacements: dict[str, str] = {}
    for slot in slots:
        if slot["kind"] == "mark":
            target = f"/themes/{theme['id']}/demo/assets/generated/theme-mark.svg"
        else:
            target = f"/themes/{theme['id']}/demo/assets/generated/{slot['slot']}.webp"
        replacements[slot["source"]] = target
        for alias in slot.get("aliases") or []:
            replacements[alias] = target

    changed = 0
    for path in iter_text_files(site):
        text = path.read_text(encoding="utf-8", errors="ignore")
        new = text
        for old, target in replacements.items():
            new = new.replace(old, target)
            # BeautifulSoup decodes query separators in src values; raw HTML
            # may still contain the entity-escaped spelling.
            if "&" in old:
                new = new.replace(old.replace("&", "&amp;"), target)
        changed += int(write_text(path, new, apply))
    return changed


def generate_media_for_theme(
    theme: dict[str, Any],
    provider: str,
    execute_ai: bool,
    max_images: int,
    apply: bool,
) -> dict[str, Any]:
    site = canonical_gallery(theme) / "site"
    generated_dir = site / "assets/generated"
    slots = media_slots(theme, max_images)
    rows = []

    if apply:
        generated_dir.mkdir(parents=True, exist_ok=True)
        (generated_dir / "theme-mark.svg").write_text(make_mark_svg(theme), encoding="utf-8")
        (generated_dir / "favicon.svg").write_text(make_mark_svg(theme), encoding="utf-8")
        make_mark_png(theme, generated_dir / "theme-mark-192.png", 192)
        make_mark_png(theme, generated_dir / "theme-mark-512.png", 512)

        # Replace stale donor PWA/touch icons in place when they exist so the
        # standalone demo cannot keep advertising a customer mark.
        icon_targets = {
            "apple-touch-icon.png": 192,
            "pwa-192x192.png": 192,
            "pwa-512x512.png": 512,
        }
        for relative, size in icon_targets.items():
            target = site / relative
            if target.exists():
                make_mark_png(theme, target, size)

    for slot in slots:
        row = dict(slot)
        if slot["kind"] == "mark":
            row.update({
                "provider": "deterministic",
                "model": None,
                "output": "assets/generated/theme-mark.svg",
            })
            rows.append(row)
            continue

        prompt = stock_prompt(
            theme_name=theme_name(theme),
            demo_brand=theme["demo_brand"],
            image_direction=theme["image_direction"],
            slot_label=slot["label"],
            context=slot["context"],
            aspect_ratio=slot["aspect_ratio"],
        )
        row["prompt"] = prompt
        if execute_ai:
            with tempfile.TemporaryDirectory(prefix="agentsam-theme-media-") as temp:
                source = Path(temp) / "source.jpg"
                meta = generate_image(
                    prompt,
                    source,
                    provider=provider,
                    aspect_ratio=slot["aspect_ratio"],
                )
                destination = generated_dir / f"{slot['slot']}.webp"
                width, height = optimize_to_webp(source, destination)
                row.update(meta)
                row.update({
                    "output": str(destination.relative_to(site)),
                    "width": width,
                    "height": height,
                })
        rows.append(row)

    # Social share art is generated separately so it is never confused with
    # an original donor reference.
    social_prompt = stock_prompt(
        theme_name=theme_name(theme),
        demo_brand=theme["demo_brand"],
        image_direction=theme["image_direction"],
        slot_label="social sharing card",
        context=theme["tagline"],
        aspect_ratio="16:9",
    )
    social_row: dict[str, Any] = {
        "kind": "generated-social",
        "slot": "social-card",
        "label": "social sharing card",
        "context": theme["tagline"],
        "aspect_ratio": "16:9",
        "source": None,
        "prompt": social_prompt,
    }
    if execute_ai:
        with tempfile.TemporaryDirectory(prefix="agentsam-theme-social-") as temp:
            source = Path(temp) / "source.jpg"
            meta = generate_image(
                social_prompt,
                source,
                provider=provider,
                aspect_ratio="16:9",
            )
            destination = generated_dir / "social-card.webp"
            width, height = optimize_to_webp(source, destination)
            social_row.update(meta)
            social_row.update({
                "output": str(destination.relative_to(site)),
                "width": width,
                "height": height,
            })
    rows.append(social_row)

    if apply:
        if execute_ai:
            patch_media_refs(theme, slots, apply=True)

        manifest_path = generated_dir / "media-manifest.json"
        previous_rows: list[dict[str, Any]] = []
        if manifest_path.exists():
            try:
                previous_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
                previous_rows = list(previous_payload.get("generated") or [])
            except (json.JSONDecodeError, OSError):
                previous_rows = []

        merged: dict[str, dict[str, Any]] = {}
        for row in [*previous_rows, *rows]:
            key = str(row.get("source") or row.get("slot") or row.get("output"))
            merged[key] = row

        persisted = []
        for row in merged.values():
            item = {
                key: row[key]
                for key in (
                    "kind", "slot", "label", "aspect_ratio",
                    "provider", "model", "output", "width", "height"
                )
                if key in row and row[key] is not None
            }
            if item.get("kind") == "source-ref":
                item["kind"] = "generated-stock"
            persisted.append(item)

        write_json(
            manifest_path,
            {
                "schema": "agentsam.theme-media.v1",
                "theme": theme["id"],
                "generated": persisted,
            },
            True,
        )
    return {
        "theme": theme["id"],
        "slots": len(slots),
        "ai_slots": sum(1 for slot in slots if slot["kind"] != "mark"),
        "mark_slots": sum(1 for slot in slots if slot["kind"] == "mark"),
        "assets": rows,
    }


def ensure_meta(soup, *, name: str | None = None, prop: str | None = None, content: str):
    selector = {"name": name} if name else {"property": prop}
    tag = soup.find("meta", attrs=selector)
    if tag is None:
        tag = soup.new_tag("meta")
        for key, value in selector.items():
            tag[key] = value
        soup.head.append(tag)
    tag["content"] = content


def seo_theme(theme: dict[str, Any], apply: bool) -> int:
    try:
        from bs4 import BeautifulSoup
    except ImportError as exc:
        raise SystemExit("pip install beautifulsoup4") from exc

    site = canonical_gallery(theme) / "site"
    if not site.exists():
        return 0
    copy = generated_copy(theme)
    description = copy.get("seo_description") or theme["description"]
    changed = 0

    for html in site.rglob("*.html"):
        rel = html.relative_to(site)
        soup = BeautifulSoup(html.read_text(encoding="utf-8", errors="ignore"), "html.parser")
        if soup.head is None:
            continue
        h1 = soup.find("h1")
        page_label = h1.get_text(" ", strip=True) if h1 else html.stem.replace("-", " ").title()
        if rel.name == "index.html" and len(rel.parts) == 1:
            page_label = theme["demo_brand"]
        title = f"{page_label} — {theme_name(theme)}"
        if soup.title:
            soup.title.string = title
        else:
            title_tag = soup.new_tag("title")
            title_tag.string = title
            soup.head.append(title_tag)

        route = "" if rel.name == "index.html" and len(rel.parts) == 1 else str(rel).replace("index.html", "")
        canonical = f"https://agentsam.inneranimalmedia.com/themes/{theme['id']}/demo/{route}"
        canonical_tag = soup.find("link", rel="canonical")
        if canonical_tag is None:
            canonical_tag = soup.new_tag("link", rel="canonical")
            soup.head.append(canonical_tag)
        canonical_tag["href"] = canonical

        ensure_meta(soup, name="description", content=description)
        ensure_meta(soup, name="robots", content="index,follow,max-image-preview:large")
        ensure_meta(soup, name="theme-color", content=theme["palette"][0])
        ensure_meta(soup, prop="og:type", content="website")
        ensure_meta(soup, prop="og:title", content=title)
        ensure_meta(soup, prop="og:description", content=description)
        ensure_meta(soup, prop="og:url", content=canonical)
        ensure_meta(
            soup,
            prop="og:image",
            content=f"https://agentsam.inneranimalmedia.com/themes/{theme['id']}/demo/assets/generated/social-card.webp",
        )
        ensure_meta(soup, name="twitter:card", content="summary_large_image")
        ensure_meta(soup, name="twitter:title", content=title)
        ensure_meta(soup, name="twitter:description", content=description)
        ensure_meta(
            soup,
            name="twitter:image",
            content=f"https://agentsam.inneranimalmedia.com/themes/{theme['id']}/demo/assets/generated/social-card.webp",
        )

        for old in soup.find_all("script", attrs={"data-agentsam-seo": "theme-remaster"}):
            old.decompose()
        schema = {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": theme["demo_brand"],
            "description": description,
            "url": canonical,
            "isPartOf": {
                "@type": "CreativeWork",
                "name": f"{theme_name(theme)} AgentSam Prebuild",
            },
        }
        script = soup.new_tag("script", type="application/ld+json")
        script["data-agentsam-seo"] = "theme-remaster"
        script.string = json.dumps(schema, ensure_ascii=False)
        soup.head.append(script)

        changed += int(write_text(html, str(soup), apply))
    return changed


def rewrite_root_paths(directory: Path) -> None:
    attr = re.compile(r"""(?P<a>(?:src|href|poster|data-src)\s*=\s*["'])/(?!/)(?P<p>[^"']+)(?P<e>["'])""", re.I)
    for path in iter_text_files(directory):
        text = path.read_text(encoding="utf-8", errors="ignore")
        new = attr.sub(r"\g<a>./\g<p>\g<e>", text)
        if new != text:
            path.write_text(new, encoding="utf-8")


def create_resolve_package(theme: dict[str, Any], apply: bool) -> None:
    package_dir = canonical_package(theme)
    root_version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    package = {
        "name": theme["package_name"],
        "version": root_version,
        "description": theme["description"],
        "type": "module",
        "main": "./src/index.js",
        "exports": {".": "./src/index.js", "./node": "./src/node.js", "./site/*": "./site/*"},
        "files": ["src", "site", "README.md"],
        "scripts": {"test": "node --test test/*.test.mjs"},
        "engines": {"node": ">=22 <25"},
        "publishConfig": {"access": "public"},
        "license": "MIT",
        "agentsam": {
            "kind": "theme",
            "slug": theme["id"],
            "installable": True,
            "portable": True,
            "prebuildRoot": "site",
            "normalization": "package_ready",
            "icon": "theme",
            "family": theme["family"],
            "canonicalId": theme["id"],
        },
    }
    manifest = {
        "id": theme["id"],
        "slug": theme["id"],
        "family": theme["family"],
        "displayName": theme_name(theme),
        "description": theme["description"],
        "installable": True,
        "portable": True,
        "prebuildRoot": "site",
    }
    if apply:
        (package_dir / "src").mkdir(parents=True, exist_ok=True)
        (package_dir / "test").mkdir(parents=True, exist_ok=True)
        write_json(package_dir / "package.json", package, True)
        (package_dir / "src/index.js").write_text(
            "export const theme = Object.freeze(" + json.dumps(manifest, indent=2) + ");\n"
            "export function createTheme(){ return structuredClone(theme); }\n"
            "export default theme;\n",
            encoding="utf-8",
        )
        (package_dir / "README.md").write_text(
            f"# {theme['package_name']}\n\n{theme['tagline']}\n\n{theme['description']}\n",
            encoding="utf-8",
        )
        (package_dir / "test/theme.test.mjs").write_text(
            "import test from 'node:test';\n"
            "import assert from 'node:assert/strict';\n"
            "import { createTheme } from '../src/index.js';\n"
            "test('resolve theme exports canonical identity',()=>{\n"
            "  const t=createTheme();\n"
            "  assert.equal(t.id,'resolve');\n"
            "  assert.equal(t.displayName,'Resolve');\n"
            "});\n",
            encoding="utf-8",
        )


def import_resolve(theme: dict[str, Any], source: str | None, apply: bool) -> dict[str, Any]:
    if not source:
        raise SystemExit(
            "Resolve source is intentionally not stored in the SDK. "
            "Pass --resolve-source with an authorized local checkout."
        )
    if not apply:
        return {
            "would_import": str(Path(source).expanduser()),
            "destination": str(canonical_gallery(theme).relative_to(ROOT)),
            "package": theme["package_name"],
        }

    with tempfile.TemporaryDirectory(prefix="agentsam-resolve-source-") as temp:
        donor = Path(temp) / "source"
        shutil.copytree(Path(source).expanduser().resolve(), donor)

        # Normalize the disposable source tree to the canonical public identity.
        for path in iter_text_files(donor):
            text = path.read_text(encoding="utf-8", errors="ignore")
            path.write_text(text, encoding="utf-8")

        # Vite 8 requires peerOptional esbuild ^0.27 || ^0.28. Normalize only
        # the disposable checkout instead of weakening peer resolution.
        donor_package_path = donor / "package.json"
        donor_package = json.loads(donor_package_path.read_text(encoding="utf-8"))
        donor_dev_dependencies = dict(donor_package.get("devDependencies") or {})
        donor_dev_dependencies["esbuild"] = "^0.28.0"
        donor_package["devDependencies"] = donor_dev_dependencies
        donor_package_path.write_text(
            json.dumps(donor_package, indent=2) + "\n",
            encoding="utf-8",
        )

        subprocess.run(
            ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"],
            cwd=donor,
            check=True,
        )
        subprocess.run(["npm", "run", "build"], cwd=donor, check=True)
        dist = donor / "dist"
        if not dist.exists():
            raise SystemExit("Resolve source build produced no dist/")

        gallery = canonical_gallery(theme)
        site = gallery / "site"
        if site.exists():
            shutil.rmtree(site)
        gallery.mkdir(parents=True, exist_ok=True)
        shutil.copytree(dist, site)
        rewrite_root_paths(site)
        ensure_theme_json(theme, gallery, True)
        create_resolve_package(theme, True)
        return {"imported": True, "site": str(site.relative_to(ROOT))}

def main() -> None:
    parser = argparse.ArgumentParser(description="AgentSam prebuild remaster pipeline")
    parser.add_argument("command", choices=["audit", "plan", "normalize", "copy", "media", "seo", "catalog", "resolve", "all"])
    parser.add_argument("--theme", default="all", help="all or comma-separated canonical ids")
    parser.add_argument("--apply", action="store_true", help="write deterministic changes")
    parser.add_argument("--execute-ai", action="store_true", help="allow paid/provider AI calls")
    parser.add_argument("--text-provider", default="auto", choices=["auto", "openai", "gemini"])
    parser.add_argument("--image-provider", default="auto", choices=["auto", "openai", "gemini"])
    parser.add_argument("--max-images", type=int, default=10)
    parser.add_argument("--resolve-source", help="authorized local source checkout for Resolve")
    args = parser.parse_args()

    manifest = load_manifest()
    selected = select_themes(manifest, args.theme)
    lookup = by_id(manifest)

    if args.command == "audit":
        print(json.dumps(audit(manifest, selected), indent=2))
        return

    if args.command == "plan":
        payload = {
            "normalize": normalize(manifest, selected, apply=False),
            "catalog": write_catalog(manifest, apply=False),
            "ai": {
                "execute_ai": args.execute_ai,
                "text_provider": args.text_provider,
                "image_provider": args.image_provider,
                "max_images_per_theme": args.max_images,
            },
        }
        print(json.dumps(payload, indent=2))
        return

    results: dict[str, Any] = {"command": args.command, "apply": args.apply}

    if args.command in {"resolve", "all"} and any(t["id"] == "resolve" for t in selected):
        results["resolve"] = import_resolve(lookup["resolve"], args.resolve_source, args.apply)

    if args.command in {"normalize", "all"}:
        results["normalize"] = normalize(manifest, selected, args.apply)

    if args.command in {"copy", "all"}:
        results["copy"] = {}
        for theme in selected:
            results["copy"][theme["id"]] = generate_copy_for_theme(
                theme,
                args.text_provider,
                args.execute_ai,
            )

    if args.command in {"media", "all"}:
        results["media"] = {}
        for theme in selected:
            if not canonical_gallery(theme).exists():
                results["media"][theme["id"]] = {"skipped": "canonical gallery missing"}
                continue
            results["media"][theme["id"]] = generate_media_for_theme(
                theme,
                args.image_provider,
                args.execute_ai,
                args.max_images,
                args.apply,
            )

    if args.command in {"seo", "all"}:
        results["seo"] = {
            theme["id"]: seo_theme(theme, args.apply)
            for theme in selected
            if canonical_gallery(theme).exists()
        }

    if args.command in {"catalog", "all"}:
        results["catalog"] = write_catalog(manifest, args.apply)

    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except RemasterAIError as exc:
        raise SystemExit(f"AI pipeline error: {exc}")
