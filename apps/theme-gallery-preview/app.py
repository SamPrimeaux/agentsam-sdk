#!/usr/bin/env python3
"""AgentSam Theme Gallery — mounts REAL historical site trees.

Gallery shell = Shopify Theme Store vibe.
Demo iframes = actual staged sites under themes/<slug>/site/.
No synthetic mini-sites. No public maturity badges.
"""

from __future__ import annotations

import html
import json
import mimetypes
import time
import uuid
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
CATALOG_PATH = ROOT / "data" / "catalog.json"
THEMES_DIR = ROOT / "themes"
GALLERY_STATIC = ROOT / "gallery" / "static"
HOST, PORT = "127.0.0.1", 8765


def load_catalog() -> list[dict]:
    if not CATALOG_PATH.exists():
        return []
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8")).get("themes", [])


def by_slug() -> dict[str, dict]:
    return {t["slug"]: t for t in load_catalog()}


def esc(v) -> str:
    return html.escape(str(v), quote=True)


def shell_header(active: str = "themes") -> str:
    return f"""
<header class="topbar"><div class="shell">
  <a class="brand" href="/themes"><span class="mark">A</span><span>AgentSam Themes</span></a>
  <nav class="nav">
    <a href="/themes" class="{'active' if active=='themes' else ''}">Explore</a>
    <a href="/themes#discover">Categories</a>
    <a href="/help" class="{'active' if active=='help' else ''}">Help</a>
  </nav>
  <div class="spacer"></div>
  <input class="search-mini" placeholder="Search themes, industries, features…" onfocus="location.href='/themes#discover'">
  <div class="account">SP</div>
</div></header>"""


def global_footer() -> str:
    return """
<footer class="footer"><div class="shell footer-grid">
  <div><div class="brand"><span class="mark">A</span><span>AgentSam Themes</span></div>
    <p style="margin-top:10px">A storefront of real working websites. Normalize underneath later — the gallery UX stays put.</p></div>
  <div><h4>Explore</h4><a href="/themes">All themes</a><a href="/themes?category=Professional">Professional</a><a href="/themes?category=Commerce">Commerce</a><a href="/themes?category=Community">Community</a></div>
  <div><h4>Build</h4><a href="/help">Theme Store help</a><a href="/help#preview">Preview lifecycle</a><a href="/help#apps">APP anatomy</a></div>
  <div><h4>Company</h4><a href="#">Inner Animal Media</a><a href="#">AgentSam</a><a href="#">Support</a></div>
</div></footer>"""


def use_modal() -> str:
    return """
<div id="use-modal" class="modal-backdrop" onclick="if(event.target===this)closeUse()">
  <div class="modal">
    <div class="modal-head"><strong>Use this design</strong><span class="spacer"></span><button class="btn" onclick="closeUse()">×</button></div>
    <div class="modal-body">
      <div id="wizard-step-1">
        <div class="kicker">Start from a real theme</div>
        <h2 id="modal-theme-name" style="margin:6px 0 18px"></h2>
        <div class="field"><label>Working name</label><input id="site-name" value=""></div>
        <div class="checks">
          <label class="check"><input type="checkbox" checked> Keep public pages</label>
          <label class="check"><input type="checkbox" checked> Theme help docs</label>
          <label class="check"><input type="checkbox" checked> Media / assets</label>
          <label class="check"><input type="checkbox"> AgentSam assistant</label>
        </div>
        <p style="color:#777;font-size:12px;line-height:1.6;margin-top:16px">
          Until a theme is normalized as an installable APP, this opens a customization / sales workflow — not a fake one-click provisioner.
        </p>
      </div>
      <div id="wizard-step-2" style="display:none">
        <div class="kicker">Review plan</div><h2>AgentSam plan</h2><div id="plan-text" class="plan"></div>
      </div>
      <div id="wizard-step-3" style="display:none">
        <div class="kicker">Receipt</div><h2>Request captured</h2>
        <div class="receipt"><strong>Mock receipt</strong>
          <p>Receipt: <code id="receipt-id"></code></p>
          <p id="receipt-note"></p>
          <p>No repository changes were made by this preview.</p>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeUse()">Cancel</button>
      <button id="continue-btn" class="btn dark" onclick="toPlan()">Continue</button>
      <button id="approve-btn" class="btn dark" style="display:none" onclick="approvePlan()">Approve plan</button>
      <a id="done-btn" class="btn dark" style="display:none" href="/themes">Back to library</a>
    </div>
  </div>
</div>"""


def page(title: str, body: str, active: str = "themes") -> str:
    return f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<link rel="stylesheet" href="/gallery/static/styles.css">
</head><body>
{shell_header(active)}
{body}
{global_footer()}
{use_modal()}
<script src="/gallery/static/app.js"></script>
</body></html>"""


def live_card_iframe(slug: str) -> str:
    return f'<iframe loading="lazy" title="{esc(slug)} preview" src="/themes/{esc(slug)}/demo/?embed=1"></iframe>'


def gallery(query: dict) -> str:
    themes = load_catalog()
    category = (query.get("category") or ["all"])[0]
    if not themes:
        body = """<main class="shell"><section class="hero-wrap">
          <div class="kicker">Setup required</div>
          <h1 class="page-title">No themes staged yet.</h1>
          <p class="lede">Run <code>python3 scripts/stage_themes.py</code> then restart the server.</p>
        </section></main>"""
        return page("AgentSam Themes", body)

    current = themes[0]
    cats = sorted({t["category"] for t in themes})
    options = ['<option value="all">All categories</option>'] + [
        f'<option value="{esc(c)}"{" selected" if c == category else ""}>{esc(c)}</option>' for c in cats
    ]
    cards = []
    for t in themes:
        search = " ".join(
            [t["name"], t.get("eyebrow", ""), t["category"], t["description"], *t.get("features", []), *t.get("industries", []), *t.get("tags", [])]
        )
        chips = "".join(f'<span class="chip">{esc(x)}</span>' for x in t.get("features", [])[:4])
        feats = esc("|".join(t.get("features", [])))
        cards.append(
            f"""
<a class="theme-card" href="/themes/{esc(t['slug'])}" data-category="{esc(t['category'])}" data-search="{esc(search)}" style="{"display:none" if category not in ("all", t["category"]) else ""}">
  <div class="card-preview">{live_card_iframe(t["slug"])}</div>
  <div class="card-info">
    <div class="card-top">
      <div><div class="card-title">{esc(t["name"])}</div><div class="card-sub">{esc(t.get("eyebrow",""))}</div></div>
      <button class="btn card-add" onclick="event.preventDefault();event.stopPropagation();openUse('{esc(t["slug"])}','{esc(t["name"])}','{feats}')">Use</button>
    </div>
    <div class="chips">{chips}</div>
  </div>
</a>"""
        )

    feats_cur = esc("|".join(current.get("features", [])))
    body = f"""
<main class="shell">
  <section class="hero-wrap">
    <div class="kicker">Website + APP template explorer</div>
    <h1 class="page-title">A theme shelf of sites you can actually open.</h1>
    <p class="lede">Every card mounts a real historical build — browse, scroll, click through. Normalize later without changing this gallery.</p>
  </section>

  <section class="current-card">
    <div class="current-browser">
      <div class="browser-chrome"><i class="dot"></i><i class="dot"></i><i class="dot"></i>
        <span class="urlbar">preview.local / current · {esc(current["slug"])}/demo</span></div>
      <div class="current-preview">
        <iframe title="Current theme" src="/themes/{esc(current["slug"])}/demo/?embed=1"></iframe>
        <div class="current-overlay">
          <div><h3>{esc(current["name"])}</h3><p>Current theme · {esc(current.get("eyebrow",""))}</p></div>
          <div class="current-actions">
            <a class="btn ghost-dark" href="/themes/{esc(current["slug"])}">Preview</a>
            <button class="btn" onclick="openUse('{esc(current["slug"])}','{esc(current["name"])}','{feats_cur}')">Use this design</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section id="discover">
    <div class="discovery-head">
      <div><h2>Discover themes</h2><p>{len(themes)} real builds mounted for localhost preview.</p></div>
      <div class="controls">
        <input id="theme-search" class="control" placeholder="Search themes" oninput="filterCards()">
        <select id="category-filter" class="control" onchange="filterCards()">{"".join(options)}</select>
      </div>
    </div>
    <div class="grid">{"".join(cards)}</div>
  </section>
</main>"""
    return page("AgentSam Theme Explorer", body)


def detail(t: dict) -> str:
    features = "".join(f'<div class="feature">✓ {esc(x)}</div>' for x in t.get("features", []))
    pages = "".join(f'<span class="page-pill">{esc(x)}</span>' for x in t.get("pages", []))
    help_topics = t.get("pages", [])
    # Prefer help folder section titles from a fixed list in theme.json if present
    docs = "".join(
        f'<a href="/themes/{esc(t["slug"])}/help#{i}"><span>{esc(x)}</span><span>→</span></a>'
        for i, x in enumerate(
            [
                "Getting started",
                "Brand & navigation",
                "Pages & content",
                "Forms & leads",
                "Media",
                "Publishing",
                "AgentSam",
            ]
        )
    )
    feats = esc("|".join(t.get("features", [])))
    body = f"""
<main class="detail-shell">
  <div class="detail-head">
    <a class="breadcrumb" href="/themes">← All themes</a><span>·</span><strong>{esc(t["name"])}</strong>
    <div class="device-switch">
      <button data-device="desktop" class="active" onclick="setDevice('desktop')">Desktop</button>
      <button data-device="mobile" onclick="setDevice('mobile')">Mobile</button>
    </div>
  </div>

  <section class="preview-stage">
    <div class="preview-frame-wrap">
      <iframe class="preview-frame" title="{esc(t["name"])} demo" src="/themes/{esc(t["slug"])}/demo/?embed=1"></iframe>
    </div>
    <div class="action-rail">
      <div><strong>{esc(t["name"])}</strong><br><small>{esc(t.get("eyebrow",""))}</small></div>
      <div class="rail-spacer"></div>
      <a class="btn" target="_blank" href="/themes/{esc(t["slug"])}/demo/">View demo</a>
      <a class="btn" href="/themes/{esc(t["slug"])}/help">Help</a>
      <button class="btn dark" onclick="openUse('{esc(t["slug"])}','{esc(t["name"])}','{feats}')">Use this design</button>
    </div>
  </section>

  <div class="detail-sections">
    <section class="panel">
      <div class="kicker">{esc(t["category"])}</div>
      <h2>{esc(t["name"])}</h2>
      <p class="lede">{esc(t["description"])}</p>
      <h3>Included capabilities</h3>
      <div class="feature-list">{features}</div>
      <h3 style="margin-top:24px">Pages</h3>
      <div class="page-list">{pages}</div>
    </section>
    <aside class="panel">
      <div class="kicker">Theme help</div>
      <h3>Documentation included</h3>
      <div class="docs-list">{docs}</div>
      <div style="margin-top:16px"><a class="btn dark" href="/themes/{esc(t["slug"])}/help">Open full help docs</a></div>
    </aside>
  </div>
</main>"""
    return page(f"{t['name']} — Theme Preview", body)


def global_help() -> str:
    body = """
<main class="shell">
  <section class="hero-wrap">
    <div class="kicker">Documentation</div>
    <h1 class="page-title">Theme Store help</h1>
    <p class="lede">How the public gallery relates to real site mounts, theme-specific owner manuals, and the later installable APP path.</p>
  </section>
  <div class="detail-sections">
    <section class="panel" id="preview">
      <h2>Preview lifecycle</h2>
      <p>Every public gallery entry mounts a real browsable site under <code>/themes/&lt;slug&gt;/demo/</code>. Cards and the detail frame load that site — not a generated imitation.</p>
      <p>Internal normalization state stays private. The customer sees a working website and theme help.</p>
    </section>
    <section class="panel" id="apps">
      <h2>APP anatomy</h2>
      <p>When a historical build is normalized into <code>apps/&lt;theme&gt;</code> with <code>.agentsam/app.json</code>, the gallery entry flips its preview source to the live APP. The shell does not need to change.</p>
    </section>
  </div>
</main>"""
    return page("Theme Store Help", body, active="help")


class Handler(BaseHTTPRequestHandler):
    server_version = "AgentSamThemeGallery/1.0"

    def log_message(self, fmt, *args):  # quieter
        pass

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, content: str, status: int = 200) -> None:
        self._send(status, content.encode("utf-8"), "text/html; charset=utf-8")

    def send_json(self, obj: dict, status: int = 200) -> None:
        self._send(status, json.dumps(obj).encode("utf-8"), "application/json")

    def send_file(self, path: Path) -> None:
        if not path.is_file():
            self.send_html("<h1>Not found</h1>", 404)
            return
        data = path.read_bytes()
        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        self._send(200, data, ctype)

    def do_GET(self) -> None:  # noqa: N802
        u = urlparse(self.path)
        path = unquote(u.path)
        query = parse_qs(u.query)

        if path in ("/", "/themes"):
            return self.send_html(gallery(query))
        if path == "/help":
            return self.send_html(global_help())
        if path == "/api/themes":
            return self.send_json({"themes": load_catalog()})

        if path.startswith("/gallery/static/"):
            rel = path[len("/gallery/static/") :]
            return self.send_file(GALLERY_STATIC / rel)

        # /themes/<slug>[/demo|/help|/...]
        parts = [p for p in path.strip("/").split("/") if p]
        if len(parts) >= 2 and parts[0] == "themes":
            slug = parts[1]
            theme = by_slug().get(slug)
            theme_dir = THEMES_DIR / slug
            if not theme_dir.exists():
                return self.send_html("<h1>Theme not found</h1>", 404)

            if len(parts) == 2:
                if not theme:
                    # still allow detail from theme.json on disk
                    tj = theme_dir / "theme.json"
                    theme = json.loads(tj.read_text()) if tj.exists() else {"slug": slug, "name": slug, "category": "", "description": "", "features": [], "pages": [], "eyebrow": ""}
                return self.send_html(detail(theme))

            action = parts[2]
            if action == "help":
                help_index = theme_dir / "help" / "index.html"
                if help_index.exists():
                    # Serve help with gallery chrome?
                    # Prefer raw help file for theme-specific docs (already self-contained).
                    return self.send_file(help_index)
                return self.send_html("<h1>Help not found</h1>", 404)

            if action == "demo":
                site_root = theme_dir / "site"
                rest = parts[3:]
                if not rest:
                    # default index
                    for candidate in ("index.html", "pages/index.html", "final-index.html"):
                        cand = site_root / candidate
                        if cand.exists():
                            return self.send_file(cand)
                    return self.send_html("<h1>Demo index missing</h1>", 404)
                # static asset under site/
                target = site_root.joinpath(*rest)
                # directory → index.html
                if target.is_dir():
                    target = target / "index.html"
                # path traversal guard
                try:
                    target.resolve().relative_to(site_root.resolve())
                except ValueError:
                    return self.send_html("<h1>Forbidden</h1>", 403)
                return self.send_file(target)

        self.send_html("<h1>Not found</h1>", 404)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/requests":
            return self.send_json({"error": "not found"}, 404)
        n = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(n) or b"{}")
        receipt = f"rcpt_{uuid.uuid4().hex[:12]}"
        self.send_json(
            {
                "ok": True,
                "receipt_id": receipt,
                "theme": payload.get("theme"),
                "name": payload.get("name"),
                "note": "Queued as a customization / sales workflow request (prototype).",
                "created_at": int(time.time()),
            }
        )


def main() -> None:
    themes = load_catalog()
    print(f"AgentSam Theme Gallery → http://{HOST}:{PORT}/themes")
    print(f"Mounted themes: {len(themes)}")
    for t in themes:
        print(f"  • {t['slug']:20} {t['name']}")
    print("Press Ctrl+C to stop.")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
