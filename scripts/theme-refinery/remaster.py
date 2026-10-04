#!/usr/bin/env python3
"""AgentSam theme prebuild remaster pipeline.

The pipeline separates three concerns:
1. private donor provenance,
2. canonical public theme/package identity,
3. generated media + SEO projections.

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
PROVENANCE_ROOT = ROOT / "reference/theme-donors"

TEXT_SUFFIXES = {
    ".html", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
    ".json", ".md", ".txt", ".webmanifest", ".xml", ".svg"
}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"}

PRIVATE_REPLACEMENTS = {
    "New Iberia": "River Parish",
    "Fight Club": "Community Men",
    "Rooted": "Community Women",
    "Caddo": "North District",
    "Shreveport": "North District",
    "Anything Floors": "Grove Surface",
    "AFM": "Grove",
    "Fuel N Free": "Ember",
    "fuelnfreetime": "ember-demo",
    "FNF": "Ember",
    "Primeaux Handyman": "Forge Works",
    "Primeaux": "Forge",
    "Lafayette": "Central District",
    "Acadiana": "the surrounding region",
    "Chrystal Clear": "Harbor Advisory",
    "CCI": "Harbor",
    "Shinshu": "Summit",
    "Jake Waalk": "Alex Rowan",
    "Nagano": "Alpine Region",
    "Bandai-Asahi": "Highland Reserve",
    "RADIAN15": "RESOLVE15",
    "RADIAN": "RESOLVE",
    "Radian": "Resolve",
}

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
    canonical = canonical_gallery(theme)
    legacy = THEMES_ROOT / theme["legacy_slug"]
    if canonical.exists():
        return canonical
    return legacy


def canonical_package(theme: dict[str, Any]) -> Path:
    return ROOT / theme["package_dir"]


def current_package(theme: dict[str, Any]) -> Path | None:
    canonical = canonical_package(theme)
    if canonical.exists():
        return canonical
    legacy = theme.get("legacy_package_dir")
    if legacy:
        p = ROOT / legacy
        if p.exists():
            return p
    return None


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
    repl: dict[str, str] = {}
    redactions = list(theme.get("redactions") or [])
    if redactions:
        repl[redactions[0]] = theme["demo_brand"]
    for term in redactions[1:]:
        repl[term] = PRIVATE_REPLACEMENTS.get(term, theme["demo_brand"])
    for old, new in PRIVATE_REPLACEMENTS.items():
        if old in redactions:
            repl[old] = new
    if theme["id"] == "resolve":
        repl.update({"RADIAN15": "RESOLVE15", "RADIAN": "RESOLVE", "Radian": "Resolve"})
    return dict(sorted(repl.items(), key=lambda item: len(item[0]), reverse=True))


def scan_terms(theme: dict[str, Any], roots: list[Path]) -> list[dict[str, Any]]:
    findings = []
    terms = list(theme.get("redactions") or [])
    for path in iter_text_files(*roots):
        text = path.read_text(encoding="utf-8", errors="ignore")
        hits = [term for term in terms if term and term.lower() in text.lower()]
        if hits:
            findings.append({
                "path": str(path.relative_to(ROOT)),
                "terms": sorted(set(hits)),
            })
    return findings


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
        agentsam.update({
            "kind": "theme",
            "slug": theme["id"],
            "galleryPath": f"apps/theme-gallery-preview/themes/{theme['id']}",
            "canonicalId": theme["id"],
            "family": theme["family"],
        })
        data["agentsam"] = agentsam
        changed += int(write_json(package_json, data, apply))

    readme = f"""# {theme['package_name']}

**{theme_name(theme)}** is an AgentSam prebuild for {theme['eyebrow'].lower()}.

{theme['tagline']}

{theme['description']}

Demo identity: **{theme['demo_brand']}**. The demo content is fictional and exists to show the layout, interaction, and content system without carrying customer branding forward.

Gallery preview: `/themes/{theme['id']}/`
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
        text = re.sub(
            r'("galleryPath"\s*:\s*)".*?"',
            rf'\1"apps/theme-gallery-preview/themes/{theme["id"]}"',
            text,
            count=1,
        )
        text = re.sub(
            r'("demoUrl"\s*:\s*)".*?"',
            rf'\1"/themes/{theme["id"]}/demo/"',
            text,
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
        "installable": False,
    }
    payload.pop("_internal", None)
    return int(write_json(path, payload, apply))


def normalize_root_package(manifest: dict[str, Any], apply: bool) -> int:
    path = ROOT / "package.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    changed = 0

    old_to_new = {
        t["legacy_package_dir"]: t["package_dir"]
        for t in manifest["themes"]
        if t.get("legacy_package_dir")
    }

    workspaces = data.get("workspaces") or []
    normalized = []
    for item in workspaces:
        normalized.append(old_to_new.get(item, item))
    for theme in manifest["themes"]:
        if theme["package_dir"] not in normalized:
            normalized.append(theme["package_dir"])
    data["workspaces"] = normalized

    exports = dict(data.get("exports") or {})
    for key, value in list(exports.items()):
        for old, new in old_to_new.items():
            if isinstance(value, str) and old in value:
                exports[key] = value.replace(old, new)
    for theme in manifest["themes"]:
        exports[f"./theme/{theme['id']}"] = f"./{theme['package_dir']}/src/index.js"
    data["exports"] = exports

    scripts = dict(data.get("scripts") or {})
    for key, value in list(scripts.items()):
        if not isinstance(value, str):
            continue
        for old, new in old_to_new.items():
            value = value.replace(old, new)
        scripts[key] = value
    data["scripts"] = scripts

    changed += int(write_json(path, data, apply))
    return changed


def scrub_public_registry(manifest: dict[str, Any], apply: bool) -> int:
    if not REGISTRY_PATH.exists():
        return 0
    text = REGISTRY_PATH.read_text(encoding="utf-8")
    new = text

    for theme in manifest["themes"]:
        old = theme.get("legacy_package_dir")
        if old:
            new = new.replace(f'path: "{old}"', f'path: "{theme["package_dir"]}"')
        new = new.replace(
            f'siteSlug: "{theme["legacy_slug"]}"',
            f'siteSlug: "{theme["id"]}"',
        )

    # Public registry should resolve canonical packages, not expose donor/client identity.
    new = re.sub(r'^\s*donor:\s*"[^"]+",\s*$', "", new, flags=re.M)

    private_aliases = {
        "companions-of-caddo", "anything-floors", "fuelnfreetime", "fuel-n-free",
        "primeaux-handyman", "chrystal-clear-insurance", "shinshu-solutions",
        "new-iberia-church", "fnf", "phs", "cci", "coc", "afm", "shin", "nic",
    }

    def filter_aliases(match: re.Match[str]) -> str:
        raw = match.group(1)
        try:
            values = json.loads("[" + raw + "]")
        except json.JSONDecodeError:
            return match.group(0)
        values = [v for v in values if str(v).lower() not in private_aliases]
        return "aliases: [" + ", ".join(json.dumps(v) for v in values) + "],"

    new = re.sub(r'aliases:\s*\[([^\]]*)\],', filter_aliases, new)
    return int(write_text(REGISTRY_PATH, new, apply))


def write_private_provenance(manifest: dict[str, Any], apply: bool) -> int:
    rows = []
    for theme in manifest["themes"]:
        rows.append({
            "canonical_id": theme["id"],
            "package": theme["package_name"],
            "legacy_slug": theme["legacy_slug"],
            "original_identity": (theme.get("redactions") or [None])[0],
            "source_repo": theme.get("donor_repo"),
            "note": "Private provenance only; never use as public product copy.",
        })
    payload = {
        "schema": "agentsam.theme-donor-lineage.v1",
        "publish": False,
        "themes": rows,
    }
    return int(write_json(PROVENANCE_ROOT / "lineage.json", payload, apply))


def normalize(manifest: dict[str, Any], selected: list[dict[str, Any]], apply: bool) -> dict[str, Any]:
    actions: list[str] = []
    for theme in selected:
        old_pkg = current_package(theme)
        canonical_pkg = canonical_package(theme)
        if old_pkg and old_pkg != canonical_pkg:
            if move_path(old_pkg, canonical_pkg, apply):
                actions.append(f"move {old_pkg.relative_to(ROOT)} -> {canonical_pkg.relative_to(ROOT)}")

        old_gallery = current_gallery(theme)
        canonical_g = canonical_gallery(theme)
        if old_gallery.exists() and old_gallery != canonical_g:
            if move_path(old_gallery, canonical_g, apply):
                actions.append(f"move {old_gallery.relative_to(ROOT)} -> {canonical_g.relative_to(ROOT)}")

        pkg = canonical_package(theme)
        gallery = canonical_gallery(theme)
        if pkg.exists() or not apply:
            if update_package_metadata(theme, pkg if pkg.exists() else canonical_pkg, apply):
                actions.append(f"normalize package metadata {theme['id']}")
        if gallery.exists() or not apply:
            if ensure_theme_json(theme, gallery, apply):
                actions.append(f"normalize gallery metadata {theme['id']}")

        roots = [p for p in [pkg, gallery] if p.exists()]
        changed = scrub_tree(theme, roots, apply)
        if changed:
            actions.append(f"scrub customer identity {theme['id']}: {changed} files")

    if normalize_root_package(manifest, apply):
        actions.append("normalize root workspace/export paths")
    if scrub_public_registry(manifest, apply):
        actions.append("remove donor identity from public theme registry")
    if write_private_provenance(manifest, apply):
        actions.append("write non-published donor provenance")

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
- Never mention a donor, client, historical customer, RADIAN, or a real company.
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
        "installable": False,
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


def media_slots(theme: dict[str, Any], max_images: int) -> list[dict[str, Any]]:
    try:
        from bs4 import BeautifulSoup
    except ImportError as exc:
        raise SystemExit("pip install beautifulsoup4") from exc

    site = canonical_gallery(theme) / "site"
    slots: list[dict[str, Any]] = []
    if not site.exists():
        return slots

    for html in sorted(site.rglob("*.html")):
        soup = BeautifulSoup(html.read_text(encoding="utf-8", errors="ignore"), "html.parser")
        for index, img in enumerate(soup.find_all("img")):
            source = str(img.get("src") or "").strip()
            if not source or source.startswith("data:"):
                continue
            context = str(img.get("alt") or "").strip()
            if not context:
                heading = soup.find(["h1", "h2"])
                context = heading.get_text(" ", strip=True) if heading else html.stem
            key_seed = f"{html.relative_to(site)}:{index}:{source}"
            slot_id = hashlib.sha1(key_seed.encode()).hexdigest()[:10]
            role = "hero" if len(slots) == 0 else "content"
            aspect = "16:9" if role == "hero" else "4:5"
            slots.append({
                "kind": "html-img",
                "file": str(html.relative_to(site)),
                "index": index,
                "source": source,
                "slot": f"{role}-{slot_id}",
                "label": f"{role} image",
                "context": context[:180],
                "aspect_ratio": aspect,
            })
            if len(slots) >= max_images:
                return slots
    return slots


def patch_html_media(theme: dict[str, Any], slots: list[dict[str, Any]], apply: bool) -> int:
    try:
        from bs4 import BeautifulSoup
    except ImportError as exc:
        raise SystemExit("pip install beautifulsoup4") from exc

    site = canonical_gallery(theme) / "site"
    by_file: dict[str, list[dict[str, Any]]] = {}
    for slot in slots:
        by_file.setdefault(slot["file"], []).append(slot)

    changed = 0
    for rel, items in by_file.items():
        path = site / rel
        soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="ignore"), "html.parser")
        images = soup.find_all("img")
        for slot in items:
            idx = slot["index"]
            if idx >= len(images):
                continue
            img = images[idx]
            img["data-remastered-from"] = slot["source"][:240]
            img["src"] = f"/themes/{theme['id']}/demo/assets/generated/{slot['slot']}.webp"
            if not img.get("alt"):
                img["alt"] = f"{theme['demo_brand']} — {slot['context']}"
            if idx == 0:
                img["loading"] = "eager"
                img["fetchpriority"] = "high"
            else:
                img["loading"] = "lazy"
                img["decoding"] = "async"
        changed += int(write_text(path, str(soup), apply))
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

    work = list(slots)
    work.append({
        "slot": "social-card",
        "label": "social sharing card",
        "context": theme["tagline"],
        "aspect_ratio": "16:9",
        "source": None,
        "kind": "generated-social",
    })

    for slot in work:
        prompt = stock_prompt(
            theme_name=theme_name(theme),
            demo_brand=theme["demo_brand"],
            image_direction=theme["image_direction"],
            slot_label=slot["label"],
            context=slot["context"],
            aspect_ratio=slot["aspect_ratio"],
        )
        row = {**slot, "prompt": prompt}
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
                row.update({"output": str(destination.relative_to(site)), "width": width, "height": height})
        rows.append(row)

    if apply:
        patch_html_media(theme, slots, apply=True)
        write_json(
            generated_dir / "media-manifest.json",
            {
                "schema": "agentsam.theme-media.v1",
                "theme": theme["id"],
                "generated": rows,
            },
            True,
        )
    return {"theme": theme["id"], "slots": len(slots), "assets": rows}


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
        "exports": {".": "./src/index.js"},
        "files": ["src", "README.md"],
        "scripts": {"test": "node --test test/*.test.mjs"},
        "engines": {"node": ">=22 <25"},
        "publishConfig": {"access": "public"},
        "license": "MIT",
        "agentsam": {
            "kind": "theme",
            "slug": theme["id"],
            "galleryPath": f"apps/theme-gallery-preview/themes/{theme['id']}",
            "installable": False,
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
        "installable": False,
        "galleryPath": f"apps/theme-gallery-preview/themes/{theme['id']}",
        "preview": {"demoUrl": f"/themes/{theme['id']}/demo/"},
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
    if not apply:
        return {
            "would_import": theme["donor_repo"],
            "destination": str(canonical_gallery(theme).relative_to(ROOT)),
            "package": theme["package_name"],
        }

    with tempfile.TemporaryDirectory(prefix="agentsam-resolve-donor-") as temp:
        donor = Path(temp) / "RADIAN15"
        if source:
            shutil.copytree(Path(source).expanduser().resolve(), donor)
        else:
            subprocess.run(
                ["git", "clone", "--depth", "1", f"https://github.com/{theme['donor_repo']}.git", str(donor)],
                check=True,
            )
        commit = subprocess.check_output(["git", "-C", str(donor), "rev-parse", "HEAD"], text=True).strip()

        # Neutralize the donor product identity before build.
        for path in iter_text_files(donor):
            text = path.read_text(encoding="utf-8", errors="ignore")
            text = text.replace("RADIAN15", "RESOLVE15")
            text = text.replace("RADIAN", "RESOLVE")
            text = text.replace("Radian", "Resolve")
            path.write_text(text, encoding="utf-8")

        subprocess.run(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"], cwd=donor, check=True)
        subprocess.run(["npm", "run", "build"], cwd=donor, check=True)
        dist = donor / "dist"
        if not dist.exists():
            raise SystemExit("RADIAN15 build produced no dist/")

        gallery = canonical_gallery(theme)
        site = gallery / "site"
        if site.exists():
            shutil.rmtree(site)
        gallery.mkdir(parents=True, exist_ok=True)
        shutil.copytree(dist, site)
        rewrite_root_paths(site)
        ensure_theme_json(theme, gallery, True)
        create_resolve_package(theme, True)

        PROVENANCE_ROOT.mkdir(parents=True, exist_ok=True)
        write_json(
            PROVENANCE_ROOT / "resolve-radian15.json",
            {
                "schema": "agentsam.theme-donor.v1",
                "publish": False,
                "canonical": "resolve",
                "source_repo": theme["donor_repo"],
                "source_commit": commit,
                "note": "Donor identity retained for provenance only. Public build is Resolve.",
            },
            True,
        )
        return {"imported": True, "source_commit": commit, "site": str(site.relative_to(ROOT))}


def main() -> None:
    parser = argparse.ArgumentParser(description="AgentSam prebuild remaster pipeline")
    parser.add_argument("command", choices=["audit", "plan", "normalize", "copy", "media", "seo", "catalog", "resolve", "all"])
    parser.add_argument("--theme", default="all", help="all or comma-separated canonical ids")
    parser.add_argument("--apply", action="store_true", help="write deterministic changes")
    parser.add_argument("--execute-ai", action="store_true", help="allow paid/provider AI calls")
    parser.add_argument("--text-provider", default="auto", choices=["auto", "openai", "gemini"])
    parser.add_argument("--image-provider", default="auto", choices=["auto", "openai", "gemini"])
    parser.add_argument("--max-images", type=int, default=10)
    parser.add_argument("--resolve-source", help="local RADIAN15 checkout instead of cloning GitHub")
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
