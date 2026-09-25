#!/usr/bin/env node
/**
 * Stage theme-gallery-preview mounts into the public AgentSam site tree.
 *
 *   apps/theme-gallery-preview/themes/<slug>/site  →  apps/frontend/public/site/themes/<slug>/demo/
 *   catalog + gallery CSS/JS + ASBD-wrapped index/detail pages
 *
 * Called from site:sync. Live path: https://agentsam.inneranimalmedia.com/themes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const galleryRoot = path.join(root, 'apps/theme-gallery-preview');
const siteThemes = path.join(root, 'apps/frontend/public/site/themes');
const catalogSrc = path.join(galleryRoot, 'data/catalog.json');

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function asbdShell(title, description, bodyHtml, active = 'themes') {
  return `<!doctype html>
<html lang="en" data-asbd-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="agentsam:page" content="themes" />
  <meta name="agentsam:route" content="agentsam.inneranimalmedia.com/themes/" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/site/global/asbd-tokens.css" />
  <link rel="stylesheet" href="/themes/static/styles.css" />
  <script src="/site/global/asbd-theme.js" defer></script>
</head>
<body data-asbd-theme="light" data-asbd-nav-active="${esc(active)}">
  <div id="asbd-header-mount"></div>
  ${bodyHtml}
  <div id="asbd-footer-mount"></div>
  <script src="/themes/static/app.js"></script>
  <script>
  (function () {
    function inject(id, url) {
      var slot = document.getElementById(id);
      if (!slot) return Promise.resolve();
      return fetch(url).then(function (r) { return r.text(); }).then(function (html) {
        var wrap = document.createElement('div');
        wrap.innerHTML = html.trim();
        while (wrap.firstChild) slot.parentNode.insertBefore(wrap.firstChild, slot);
        slot.remove();
      }).catch(function () {});
    }
    Promise.all([
      inject('asbd-header-mount', '/site/global/asbd-header.html'),
      inject('asbd-footer-mount', '/site/global/asbd-footer.html')
    ]).then(function () {
      if (window.AsbdTheme) AsbdTheme.syncFromDocument();
    });
  })();
  </script>
</body>
</html>`;
}

function useModal() {
  return `<div id="use-modal" class="modal-backdrop" onclick="if(event.target===this)closeUse()">
  <div class="modal">
    <div class="modal-head"><strong>Use this design</strong><span class="spacer"></span><button class="btn" type="button" onclick="closeUse()">×</button></div>
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
        <div class="receipt"><strong>Preview receipt</strong>
          <p>Receipt: <code id="receipt-id"></code></p>
          <p id="receipt-note"></p>
          <p>No repository changes were made by this preview.</p>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" type="button" onclick="closeUse()">Cancel</button>
      <button id="continue-btn" class="btn dark" type="button" onclick="toPlan()">Continue</button>
      <button id="approve-btn" class="btn dark" type="button" style="display:none" onclick="approvePlan()">Approve plan</button>
      <a id="done-btn" class="btn dark" style="display:none" href="/themes/">Back to library</a>
    </div>
  </div>
</div>`;
}

function galleryPage(themes) {
  const current = themes[0];
  const cats = [...new Set(themes.map((t) => t.category))].sort();
  const options = ['<option value="all">All categories</option>']
    .concat(cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`))
    .join('');

  const cards = themes
    .map((t) => {
      const search = [t.name, t.eyebrow, t.category, t.description, ...(t.features || []), ...(t.industries || []), ...(t.tags || [])].join(' ');
      const chips = (t.features || []).slice(0, 4).map((x) => `<span class="chip">${esc(x)}</span>`).join('');
      const feats = esc((t.features || []).join('|'));
      return `<a class="theme-card" href="/themes/${esc(t.slug)}/" data-category="${esc(t.category)}" data-search="${esc(search)}">
  <div class="card-preview"><iframe loading="lazy" title="${esc(t.slug)} preview" src="/themes/${esc(t.slug)}/demo/?embed=1"></iframe></div>
  <div class="card-info">
    <div class="card-top">
      <div><div class="card-title">${esc(t.name)}</div><div class="card-sub">${esc(t.eyebrow || '')}</div></div>
      <button class="btn card-add" type="button" onclick="event.preventDefault();event.stopPropagation();openUse('${esc(t.slug)}','${esc(t.name)}','${feats}')">Use</button>
    </div>
    <div class="chips">${chips}</div>
  </div>
</a>`;
    })
    .join('\n');

  const featsCur = esc((current.features || []).join('|'));
  const body = `<main class="shell themes-asbd-pad">
  <section class="hero-wrap">
    <div class="kicker">Website + APP template explorer</div>
    <h1 class="page-title">A theme shelf of sites you can actually open.</h1>
    <p class="lede">Every card mounts a real historical build — browse, scroll, click through. Normalize later without changing this gallery.</p>
  </section>
  <section class="current-card">
    <div class="current-browser">
      <div class="browser-chrome"><i class="dot"></i><i class="dot"></i><i class="dot"></i>
        <span class="urlbar">agentsam.inneranimalmedia.com / themes / ${esc(current.slug)}/demo</span></div>
      <div class="current-preview">
        <iframe title="Current theme" src="/themes/${esc(current.slug)}/demo/?embed=1"></iframe>
        <div class="current-overlay">
          <div><h3>${esc(current.name)}</h3><p>Current theme · ${esc(current.eyebrow || '')}</p></div>
          <div class="current-actions">
            <a class="btn ghost-dark" href="/themes/${esc(current.slug)}/">Preview</a>
            <button class="btn" type="button" onclick="openUse('${esc(current.slug)}','${esc(current.name)}','${featsCur}')">Use this design</button>
          </div>
        </div>
      </div>
    </div>
  </section>
  <section id="discover">
    <div class="discovery-head">
      <div><h2>Discover themes</h2><p>${themes.length} real builds mounted for live preview.</p></div>
      <div class="controls">
        <input id="theme-search" class="control" placeholder="Search themes" oninput="filterCards()">
        <select id="category-filter" class="control" onchange="filterCards()">${options}</select>
      </div>
    </div>
    <div class="grid">${cards}</div>
  </section>
</main>
${useModal()}`;

  return asbdShell('AgentSam Themes', 'Live theme gallery of real historical website builds.', body);
}

function detailPage(t) {
  const feats = (t.features || []).map((x) => `<div class="feature">${esc(x)}</div>`).join('');
  const pages = (t.pages || []).map((x) => `<span class="page-pill">${esc(x)}</span>`).join('');
  const featPipe = esc((t.features || []).join('|'));
  const body = `<div class="detail-shell themes-asbd-pad">
  <div class="detail-head">
    <div class="breadcrumb"><a href="/themes/">Themes</a> / ${esc(t.name)}</div>
    <div class="device-switch">
      <button type="button" class="active" data-device="desktop" onclick="setDevice('desktop')">Desktop</button>
      <button type="button" data-device="mobile" onclick="setDevice('mobile')">Mobile</button>
    </div>
  </div>
  <div class="preview-stage">
    <div class="preview-frame-wrap">
      <iframe class="preview-frame" title="${esc(t.name)}" src="/themes/${esc(t.slug)}/demo/"></iframe>
    </div>
    <div class="action-rail">
      <div><strong>${esc(t.name)}</strong><br><small>${esc(t.eyebrow || t.category)}</small></div>
      <div class="rail-spacer"></div>
      <a class="btn" href="/themes/${esc(t.slug)}/demo/" target="_blank" rel="noopener">Open full site</a>
      <button class="btn dark" type="button" onclick="openUse('${esc(t.slug)}','${esc(t.name)}','${featPipe}')">Use this design</button>
    </div>
  </div>
  <div class="detail-sections">
    <div class="panel">
      <h2>About this build</h2>
      <p>${esc(t.description)}</p>
      <h3>Features</h3>
      <div class="feature-list">${feats}</div>
    </div>
    <div class="panel">
      <h3>Pages</h3>
      <div class="page-list">${pages}</div>
      <h3 style="margin-top:22px">Docs</h3>
      <div class="docs-list">
        <a href="/learn/">Learn gallery <span>→</span></a>
        <a href="/packages/sdk/help/">SDK Help <span>→</span></a>
      </div>
    </div>
  </div>
</div>
${useModal()}`;
  return asbdShell(`${t.name} — AgentSam Themes`, t.description || t.name, body);
}

if (!fs.existsSync(catalogSrc)) {
  console.warn('[stage-themes] catalog missing — skip');
  process.exit(0);
}

const raw = JSON.parse(fs.readFileSync(catalogSrc, 'utf8'));
const themes = (raw.themes || []).map((t) => {
  const copy = { ...t };
  delete copy._internal;
  return copy;
});

rmrf(siteThemes);
fs.mkdirSync(siteThemes, { recursive: true });

const staticDest = path.join(siteThemes, 'static');
copyDir(path.join(galleryRoot, 'gallery/static'), staticDest);

// Pad for fixed ASBD header
const padCss = `\n/* staged for ASBD shell */\n.themes-asbd-pad{padding-top:calc(var(--asbd-header-height,76px) + 8px)}\n`;
fs.appendFileSync(path.join(staticDest, 'styles.css'), padCss);

// Client-side receipt when /api/requests is absent on production
const appJs = fs.readFileSync(path.join(staticDest, 'app.js'), 'utf8');
const patched = appJs.replace(
  /async function approvePlan\(\)\{[\s\S]*?\n\}/,
  `async function approvePlan(){
  const modal=document.getElementById('use-modal');
  const name=document.getElementById('site-name').value.trim()||'Untitled project';
  let data={receipt_id:'local-'+Date.now().toString(36),note:'Preview receipt (no backend write).'};
  try{
    const res=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:modal.dataset.slug,name})});
    if(res.ok) data=await res.json();
  }catch(_){}
  document.getElementById('wizard-step-2').style.display='none';
  document.getElementById('wizard-step-3').style.display='block';
  document.getElementById('receipt-id').textContent=data.receipt_id;
  document.getElementById('receipt-note').textContent=data.note||'';
  document.getElementById('approve-btn').style.display='none';
  document.getElementById('done-btn').style.display='inline-flex';
}`
);
fs.writeFileSync(path.join(staticDest, 'app.js'), patched);

fs.writeFileSync(
  path.join(siteThemes, 'catalog.json'),
  `${JSON.stringify({ schema: 'agentsam.themes.v1', generated_at: new Date().toISOString(), themes }, null, 2)}\n`
);

fs.writeFileSync(path.join(siteThemes, 'index.html'), galleryPage(themes));

for (const t of themes) {
  const slugDir = path.join(siteThemes, t.slug);
  const demoSrc = path.join(galleryRoot, 'themes', t.slug, 'site');
  const demoDest = path.join(slugDir, 'demo');
  fs.mkdirSync(slugDir, { recursive: true });
  if (fs.existsSync(demoSrc)) copyDir(demoSrc, demoDest);
  else fs.mkdirSync(demoDest, { recursive: true });
  fs.writeFileSync(path.join(slugDir, 'index.html'), detailPage(t));
}

console.log(
  JSON.stringify(
    {
      ok: true,
      themes: themes.length,
      out: path.relative(root, siteThemes),
    },
    null,
    2
  )
);
