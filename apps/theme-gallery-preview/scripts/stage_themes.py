#!/usr/bin/env python3
"""Stage real historical site trees into theme-gallery-preview/themes/*/site.

Does not invent synthetic demos. Rewrites root-absolute asset paths so sites
can be served under /themes/<slug>/demo/.
"""

from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
THEMES = ROOT / "themes"
HOME = Path.home()

ABS_ATTR = re.compile(
    r"""(?P<attr>(?:src|href|poster|data-src)\s*=\s*["'])/(?!/)(?P<path>[^"']+)(?P<end>["'])""",
    re.I,
)


def rewrite_root_paths(directory: Path) -> int:
    changed = 0
    for path in directory.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".html", ".css", ".js", ".mjs", ".json", ".webmanifest"}:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        new = ABS_ATTR.sub(r"\g<attr>./\g<path>\g<end>", text)
        # SPA base — prefer relative assets over site root
        if path.suffix.lower() == ".html" and 'href="/assets/' in text:
            new = new.replace('href="/assets/', 'href="./assets/')
            new = new.replace('src="/assets/', 'src="./assets/')
        if new != text:
            path.write_text(new, encoding="utf-8")
            changed += 1
    return changed


def copy_tree(src: Path, dst: Path, ignore=None) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=ignore, dirs_exist_ok=False)


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def write_help(theme_dir: Path, title: str, sections: list[tuple[str, str]]) -> None:
    help_dir = theme_dir / "help"
    help_dir.mkdir(parents=True, exist_ok=True)
    nav = "\n".join(f'      <a href="#{i}">{label}</a>' for i, (label, _) in enumerate(sections))
    body = []
    for i, (label, copy) in enumerate(sections):
        body.append(
            f'<section id="{i}"><div class="kicker">0{i+1}</div><h2>{label}</h2>'
            f"<p>{copy}</p>"
            f"<ul><li>What this area controls</li><li>Theme-specific vs shared platform behavior</li>"
            f"<li>How to preview changes safely</li><li>How to publish</li></ul></section>"
        )
    # A lightweight help shell — themed later by app.py wrapping; also standalone.
    (help_dir / "index.html").write_text(
        f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} Help</title><link rel="stylesheet" href="/gallery/static/styles.css"></head>
<body class="help-standalone">
<header class="help-hero"><div class="kicker">Theme help</div><h1>{title} documentation</h1>
<p>Owner's manual for this APP theme. Platform-wide AgentSam docs stay shared underneath.</p></header>
<main class="help-layout"><aside class="help-nav"><strong>On this page</strong>{nav}
<a href="../">← Back to theme</a></aside>
<article class="help-content">{"".join(body)}</article></main>
</body></html>
""",
        encoding="utf-8",
    )


def stage_insurance() -> dict:
    src = HOME / "Projects/client-demos/chrystal-clear-insurance/chrystal-clear-insurance/dist"
    theme = THEMES / "insurance-site"
    site = theme / "site"
    copy_tree(src, site)
    rewrite_root_paths(site)
    # Prefer homepage entry
    if not (site / "index.html").exists():
        raise SystemExit(f"missing index for insurance: {site}")
    write_help(
        theme,
        "Chrystal Clear Insurance",
        [
            ("Brand & company info", "Company name, logo, colors, and trust signals for the insurance practice."),
            ("Navigation", "Primary nav across Coverage, Claims, Resources, and Contact."),
            ("Coverage / service pages", "Product and service storytelling pages that map to CMS sections."),
            ("Quote request form", "Lead capture for quotes — fields, routing, and confirmation."),
            ("Lead management", "Where quote submissions land and how follow-up is handled."),
            ("Media", "Hero imagery, team photos, and document assets."),
            ("SEO", "Titles, descriptions, and share cards for public pages."),
            ("Publishing", "Draft → preview → publish for the insurance storefront."),
            ("AgentSam", "Ask AgentSam for coverage copy, form tweaks, and section suggestions."),
        ],
    )
    return {
        "slug": "insurance-site",
        "appId": "insurance-site",
        "name": "Chrystal Clear Insurance",
        "eyebrow": "Insurance / Professional Services",
        "category": "Professional",
        "industries": ["Insurance", "Professional Services"],
        "tags": ["quotes", "trust", "lead-forms"],
        "description": "Real Chrystal Clear Insurance build — editorial insurance storefront with coverage storytelling and quote capture.",
        "features": ["CMS", "Lead forms", "Media", "Email"],
        "pages": ["Home", "Coverage", "About", "Claims", "Resources", "Contact", "Help"],
        "preview": {
            "kind": "live",
            "card": "/themes/insurance-site/demo/",
            "desktop": "/themes/insurance-site/demo/",
            "mobile": "/themes/insurance-site/demo/",
            "demoUrl": "/themes/insurance-site/demo/",
        },
        "installable": False,
        "_internal": {"normalization": "pending", "source": str(src)},
    }


def stage_handyman() -> dict:
    src = HOME / "worktrees/primeaux-handyman-services-agent/dist"
    theme = THEMES / "handyman-site"
    site = theme / "site"
    copy_tree(src, site)
    rewrite_root_paths(site)
    write_help(
        theme,
        "Primeaux Handyman Services",
        [
            ("Service catalog", "Define services, pricing cues, and service-area messaging."),
            ("Project gallery", "Before/after and job proof for local trust."),
            ("Estimate forms", "Mobile-first estimate requests and lead routing."),
            ("PWA setup", "Installable local-services PWA behavior and icons."),
            ("Service areas", "Geographic coverage for Lafayette / Acadiana operators."),
            ("Publishing", "Draft → preview → publish for the trades storefront."),
            ("AgentSam", "Ask AgentSam for service copy, CTAs, and gallery layout help."),
        ],
    )
    return {
        "slug": "handyman-site",
        "appId": "handyman-site",
        "name": "Primeaux Handyman Services",
        "eyebrow": "Home Services / Trades",
        "category": "Services",
        "industries": ["Home Services", "Trades"],
        "tags": ["estimates", "pwa", "local"],
        "description": "Real Primeaux Handyman PWA build — mobile-first service site with estimates and project proof.",
        "features": ["CMS", "PWA", "Forms", "Leads"],
        "pages": ["Home", "Services", "Projects", "Service Areas", "About", "Contact", "Help"],
        "preview": {
            "kind": "live",
            "card": "/themes/handyman-site/demo/",
            "desktop": "/themes/handyman-site/demo/",
            "mobile": "/themes/handyman-site/demo/",
            "demoUrl": "/themes/handyman-site/demo/",
        },
        "installable": False,
        "_internal": {"normalization": "pending", "source": str(src)},
    }


def stage_church() -> dict:
    src = HOME / "Library/Mobile Documents/com~apple~CloudDocs/Projects/Cloudflare/NewIberiaChurchofChrist"
    theme = THEMES / "church-site"
    site = theme / "site"
    if site.exists():
        shutil.rmtree(site)
    site.mkdir(parents=True)

    # Curate public pages only — skip admin/dashboard variants.
    page_map = {
        "index.html": ["homepage-final.html", "homepage-remastered.html", "index-home.html"],
        "beliefs.html": ["beliefs.html"],
        "community.html": ["community.html"],
        "mission.html": ["mission.html"],
        "connect.html": ["connect.html"],
        "donate.html": ["donate.html"],
        "groups.html": ["groups-production.html", "groups-refined-final.html", "groups.html"],
        "mensgroup.html": ["mensgroup.html"],
        "womansgroup.html": ["womansgroup.html"],
    }
    for dest_name, candidates in page_map.items():
        for cand in candidates:
            p = src / cand
            if p.exists() and p.stat().st_size > 500:
                shutil.copy2(p, site / dest_name)
                break

    # Assets
    for folder in ("church-images-optimized", "church-images", "icons"):
        s = src / folder
        if s.exists():
            copy_tree(s, site / folder)

    for js in ("admin-dashboard.js",):  # skip admin; keep if referenced? don't copy admin
        pass

    rewrite_root_paths(site)
    # Ensure Help link target exists in-site via gallery route; local stub:
    (site / "help.html").write_text(
        '<!doctype html><meta http-equiv="refresh" content="0;url=../help/">',
        encoding="utf-8",
    )
    write_help(
        theme,
        "New Iberia Church of Christ",
        [
            ("Church information", "Name, address, service times, and welcome messaging."),
            ("Service times", "Sunday and midweek schedule surfaces."),
            ("Ministries", "Men's, women's, and community ministry pages."),
            ("Groups", "Small groups discovery and connection."),
            ("Sermons / livestream", "Message archives and live worship entry points."),
            ("Events", "Upcoming gatherings and calendar."),
            ("Giving", "Donate flows and stewardship messaging."),
            ("Contact", "Visit planning and staff contact."),
            ("Publishing", "How content editors update pages without breaking the public site."),
        ],
    )
    return {
        "slug": "church-site",
        "appId": "church-site",
        "name": "New Iberia Church of Christ",
        "eyebrow": "Church / Community",
        "category": "Community",
        "industries": ["Church", "Nonprofit"],
        "tags": ["groups", "giving", "visit"],
        "description": "Real New Iberia Church of Christ public pages — visit, groups, mission, and giving.",
        "features": ["CMS", "Events", "Giving", "Media"],
        "pages": ["Home", "Beliefs", "Community", "Mission", "Groups", "Donate", "Connect", "Help"],
        "preview": {
            "kind": "live",
            "card": "/themes/church-site/demo/",
            "desktop": "/themes/church-site/demo/",
            "mobile": "/themes/church-site/demo/",
            "demoUrl": "/themes/church-site/demo/",
        },
        "installable": False,
        "_internal": {"normalization": "pending", "source": str(src)},
    }


def stage_companions() -> dict:
    src = HOME / "companionscpas"
    theme = THEMES / "companions-site"
    site = theme / "site"
    if site.exists():
        shutil.rmtree(site)
    site.mkdir(parents=True)

    # Mount the real static public surface + global shell assets.
    copy_tree(src / "static" / "pages", site / "pages")
    copy_tree(src / "static" / "global", site / "global")
    if (src / "static" / "assets").exists():
        copy_tree(src / "static" / "assets", site / "assets")
    for logo in ("logo.png", "logo.webp", "companionsofcpa-newlogo-512x512.png", "companionsofcpa-newlogo.webp"):
        p = src / "public" / logo
        if p.exists():
            shutil.copy2(p, site / logo)

    # Entry: real pages/index.html if complete; else assemble a shell that loads fragments.
    index_src = site / "pages" / "index.html"
    if index_src.exists():
        shutil.copy2(index_src, site / "index.html")
    rewrite_root_paths(site)
    write_help(
        theme,
        "Companions of Caddo",
        [
            ("Mission & story", "Why Companions exists and how visitors understand the work."),
            ("Campaigns", "Active campaigns and fundraising storytelling."),
            ("Animals & transport", "Rescue transport wins and animal pathways."),
            ("Donate", "Donation entry points and partner processors."),
            ("Volunteer / foster", "Paths to get involved."),
            ("Impact", "Stats and proof that build donor confidence."),
            ("Publishing", "How CPAS editors update home/about surfaces."),
            ("AgentSam", "Ask AgentSam for campaign copy and section layout help."),
        ],
    )
    return {
        "slug": "companions-site",
        "appId": "companions-site",
        "name": "Companions of Caddo",
        "eyebrow": "Nonprofit / Animal Rescue",
        "category": "Community",
        "industries": ["Nonprofit", "Animal Rescue"],
        "tags": ["donate", "foster", "campaigns"],
        "description": "Real Companions of Caddo public static surface — mission, campaigns, and involvement paths.",
        "features": ["CMS", "Donations", "Campaigns", "Email"],
        "pages": ["Home", "About", "Campaigns", "Get Involved", "Donate", "Help"],
        "preview": {
            "kind": "live",
            "card": "/themes/companions-site/demo/",
            "desktop": "/themes/companions-site/demo/",
            "mobile": "/themes/companions-site/demo/",
            "demoUrl": "/themes/companions-site/demo/",
        },
        "installable": False,
        "_internal": {"normalization": "pending", "source": str(src / "static")},
    }


def stage_floors() -> dict:
    src = Path("/Volumes/Expansion/Anything Floors & More")
    theme = THEMES / "floors-site"
    site = theme / "site"
    if site.exists():
        shutil.rmtree(site)
    site.mkdir(parents=True)

    # Portable public site only — not the 4.8G image dump / node_modules.
    for name in ("index.html", "final-index.html"):
        p = src / name
        if p.exists():
            shutil.copy2(p, site / ("index.html" if name.startswith("final") or name == "index.html" else name))
    # Prefer final-index as homepage if present
    if (src / "final-index.html").exists():
        shutil.copy2(src / "final-index.html", site / "index.html")
    elif (src / "index.html").exists():
        shutil.copy2(src / "index.html", site / "index.html")

    copy_tree(src / "pages", site / "pages")
    copy_tree(src / "shared", site / "shared")
    copy_tree(src / "assets", site / "assets")
    for logo in ("ANYTHINGFLOORS&MORELOGO.png", "ANYTHINGFLOORSANDMORE.webp"):
        p = src / logo
        if p.exists():
            shutil.copy2(p, site / logo)

    rewrite_root_paths(site)
    write_help(
        theme,
        "Anything Floors & More",
        [
            ("Brand & company info", "Contractor identity, service area, and trust signals."),
            ("Capabilities", "Flooring and remodel capabilities presented as service pages."),
            ("Project gallery", "Before/after and finished project proof."),
            ("Process", "How a project moves from estimate to install."),
            ("Estimate workflow", "Contact and estimate capture."),
            ("Team pages", "Who shows up on the job."),
            ("Publishing", "Draft → preview → publish for the contractor storefront."),
            ("AgentSam", "Ask AgentSam for project captions and CTA wording."),
        ],
    )
    return {
        "slug": "floors-site",
        "appId": "floors-site",
        "name": "Anything Floors & More",
        "eyebrow": "Contractor / Construction",
        "category": "Services",
        "industries": ["Contractor", "Flooring"],
        "tags": ["gallery", "estimates", "projects"],
        "description": "Real Anything Floors & More public site — services, gallery, process, and contact.",
        "features": ["CMS", "Gallery", "Forms", "Auth"],
        "pages": ["Home", "Services", "Gallery", "Process", "Contact", "Help"],
        "preview": {
            "kind": "live",
            "card": "/themes/floors-site/demo/",
            "desktop": "/themes/floors-site/demo/",
            "mobile": "/themes/floors-site/demo/",
            "demoUrl": "/themes/floors-site/demo/",
        },
        "installable": False,
        "_internal": {"normalization": "pending", "source": str(src)},
    }


def stage_shinshu() -> dict:
    src = HOME / "IAM-Library/01_Template_Candidates/MEAUXIDERANDOMBUILDS/06_shinshu_static_site_archive/source/shinshu-solutions/static"
    theme = THEMES / "shinshu-site"
    site = theme / "site"
    copy_tree(
        src,
        site,
        ignore=shutil.ignore_patterns(
            "dashboard-cms.html",
            "*-email.html",
            "jake-onboarding-email.html",
            "onboarding-email.html",
            "project-summary-email.html",
            "sam-dev-overview-email.html",
        ),
    )
    rewrite_root_paths(site)
    write_help(
        theme,
        "Shinshu Solutions",
        [
            ("Brand & bilingual surface", "Japanese/English presentation and brand voice."),
            ("Services", "Advisory and solution offerings."),
            ("Gallery / adventures", "Visual storytelling and trip/work archives."),
            ("Contact", "Inquiry and onboarding paths."),
            ("Dashboard CMS", "Content editing surfaces that ship with the build."),
            ("Publishing", "How static pages and CMS content stay in sync."),
            ("AgentSam", "Ask AgentSam for bilingual copy and section structure."),
        ],
    )
    return {
        "slug": "shinshu-site",
        "appId": "shinshu-site",
        "name": "Shinshu Solutions",
        "eyebrow": "Consultant / Leadership",
        "category": "Professional",
        "industries": ["Consulting", "Education"],
        "tags": ["bilingual", "portfolio", "cms"],
        "description": "Real Shinshu Solutions static archive — services, gallery, and CMS-ready pages.",
        "features": ["CMS", "Portfolio", "Media", "Forms"],
        "pages": ["Home", "Services", "About", "Gallery", "Adventures", "Contact", "Help"],
        "preview": {
            "kind": "live",
            "card": "/themes/shinshu-site/demo/",
            "desktop": "/themes/shinshu-site/demo/",
            "mobile": "/themes/shinshu-site/demo/",
            "demoUrl": "/themes/shinshu-site/demo/",
        },
        "installable": False,
        "_internal": {"normalization": "pending", "source": str(src)},
    }


def stage_fuelnfree() -> dict:
    src = HOME / "fuelnfreetime/legacy"
    theme = THEMES / "fuelnfree-site"
    site = theme / "site"
    copy_tree(src, site, ignore=shutil.ignore_patterns("README.md"))
    rewrite_root_paths(site)
    write_help(
        theme,
        "Fuel & Free Time",
        [
            ("Brand & merchandising", "High-octane lifestyle brand voice and collection storytelling."),
            ("Shop", "Product discovery and collection entry points."),
            ("About", "Brand story and community positioning."),
            ("Community", "Collabs and lifestyle content."),
            ("Navigation", "Header/footer patterns across public pages."),
            ("Publishing", "How legacy HTML pages map into the future CMS."),
            ("AgentSam", "Ask AgentSam for campaign headlines and merchandising copy."),
        ],
    )
    return {
        "slug": "fuelnfree-site",
        "appId": "fuelnfree-site",
        "name": "Fuel & Free Time",
        "eyebrow": "Retail / Ecommerce",
        "category": "Commerce",
        "industries": ["Retail", "Lifestyle"],
        "tags": ["shop", "collections", "brand"],
        "description": "Real Fuel & Free Time legacy storefront pages — home, shop, about, and community.",
        "features": ["Commerce", "CMS", "Search", "Cart"],
        "pages": ["Home", "Shop", "About", "Community", "Help"],
        "preview": {
            "kind": "live",
            "card": "/themes/fuelnfree-site/demo/",
            "desktop": "/themes/fuelnfree-site/demo/",
            "mobile": "/themes/fuelnfree-site/demo/",
            "demoUrl": "/themes/fuelnfree-site/demo/",
        },
        "installable": False,
        "_internal": {"normalization": "pending", "source": str(src)},
    }


def main() -> None:
    THEMES.mkdir(parents=True, exist_ok=True)
    catalog = []
    stages = [
        ("insurance-site", stage_insurance),
        ("handyman-site", stage_handyman),
        ("church-site", stage_church),
        ("companions-site", stage_companions),
        ("floors-site", stage_floors),
        ("shinshu-site", stage_shinshu),
        ("fuelnfree-site", stage_fuelnfree),
    ]
    for slug, fn in stages:
        print(f"→ staging {slug}")
        try:
            entry = fn()
        except Exception as exc:  # noqa: BLE001
            print(f"  ! skipped {slug}: {exc}")
            continue
        write_json(THEMES / slug / "theme.json", entry)
        catalog.append(entry)
        print(f"  ✓ {entry['name']} → themes/{slug}/site")

    write_json(ROOT / "data" / "catalog.json", {"themes": catalog, "version": 1})
    print(f"\nCatalog: {len(catalog)} live themes → {ROOT / 'data' / 'catalog.json'}")


if __name__ == "__main__":
    main()
