const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/**
 * One self-contained review.html placed at the run root, so every path in it is relative to the run.
 * Click through states, switch viewports, see what changed since an earlier snapshot. Text is placed
 * with textContent, the data is escaped JSON, and a CSP blocks every network request.
 */
export function renderReviewHtml({ manifest, screenplay, derivatives = [], compare = [] }) {
  const byOrigin = new Map();
  for (const d of derivatives) { if (!byOrigin.has(d.of)) byOrigin.set(d.of, []); byOrigin.get(d.of).push(d); }
  const pick = (key) => {
    const list = byOrigin.get(key) ?? [];
    const webp = list.filter((d) => d.format === 'webp' && d.width).sort((a, b) => Math.abs(a.width - 960) - Math.abs(b.width - 960))[0];
    return { src: list.find((d) => d.format === 'mp4')?.key ?? webp?.key ?? key, poster: list.find((d) => d.key.endsWith('.poster.webp'))?.key ?? null };
  };
  const contentType = new Map(manifest.assets.map((a) => [a.key, a.contentType]));
  const scenes = screenplay.scenes.map((scene) => ({
    ...scene, assets: scene.assets.map((a) => ({ ...a, ...pick(a.key), contentType: contentType.get(a.key) ?? '' })),
  }));
  const data = { runId: manifest.runId, subject: manifest.subject, status: manifest.status, reasons: manifest.reasons, missing: manifest.missing, sealedAt: manifest.sealedAt, scenes, compare };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>${esc(manifest.subject)} · evidence review</title>
<style>
:root{color-scheme:light dark;--bg:#f6f7f8;--panel:#fff;--ink:#14181c;--mute:#5c6670;--line:#dfe3e7;--ok:#1b7f4b;--warn:#a86400;--bad:#b3261e;--accent:#2457d6}
@media (prefers-color-scheme:dark){:root{--bg:#101316;--panel:#171b1f;--ink:#e8ecef;--mute:#9aa5af;--line:#2a3138;--ok:#4cc38a;--warn:#e0a23a;--bad:#ff7b72;--accent:#7aa2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif}
header{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:14px 20px;border-bottom:1px solid var(--line);background:var(--panel)}
h1{font-size:16px;margin:0}.badge{padding:2px 10px;border-radius:99px;border:1px solid currentColor;font-size:12px;font-weight:600}
.verified{color:var(--ok)}.degraded{color:var(--warn)}.failed{color:var(--bad)}.mute{color:var(--mute)}
main{display:grid;grid-template-columns:280px 1fr;min-height:calc(100vh - 56px)}@media (max-width:760px){main{grid-template-columns:1fr}}
nav{border-right:1px solid var(--line);background:var(--panel);overflow:auto;max-height:calc(100vh - 56px)}
nav button{display:block;width:100%;text-align:left;padding:10px 16px;border:0;border-bottom:1px solid var(--line);background:none;color:inherit;font:inherit;cursor:pointer}
nav button[aria-current=true]{background:var(--bg);box-shadow:inset 3px 0 var(--accent)}nav small{display:block;color:var(--mute)}
section{padding:18px 22px}#tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
#tabs button{padding:5px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:inherit;font:inherit;cursor:pointer}
#tabs button[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}
#stage img,#stage video{max-width:100%;height:auto;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
#changes img{max-width:100%;margin:8px 0;border:1px solid var(--line);border-radius:8px}kbd{border:1px solid var(--line);border-radius:4px;padding:0 5px}
</style></head><body>
<header><h1 id="title"></h1><span id="badge" class="badge"></span><span id="sealed" class="mute"></span><span class="mute">Use <kbd>←</kbd> <kbd>→</kbd> for states, <kbd>v</kbd> for viewports</span></header>
<main><nav id="list"></nav><section><div id="tabs"></div><h2 id="scene"></h2><p id="caption" class="mute"></p><div id="stage"></div><div id="changes"></div><p id="issues" class="mute"></p></section></main>
<script type="application/json" id="data">${safeJson(data)}</script>
<script>
(function () {
  var D = JSON.parse(document.getElementById('data').textContent);
  var sceneIndex = 0, viewport = null;
  function $(id) { return document.getElementById(id); }
  function el(tag, text, attrs) { var n = document.createElement(tag); if (text != null) n.textContent = text; for (var k in (attrs || {})) n.setAttribute(k, attrs[k]); return n; }
  var viewports = (function () { var seen = {}; D.scenes.forEach(function (s) { s.assets.forEach(function (a) { seen[a.viewport || 'default'] = 1; }); }); return Object.keys(seen); })();
  viewport = viewports[viewports.length - 1] || 'default';
  $('title').textContent = D.subject;
  $('badge').textContent = D.status; $('badge').className = 'badge ' + D.status;
  $('sealed').textContent = D.runId + ' · sealed ' + D.sealedAt;
  function pickAsset(scene) { var list = scene.assets.filter(function (a) { return (a.viewport || 'default') === viewport; }); return list[0] || null; }
  function renderList() {
    var nav = $('list'); nav.textContent = '';
    D.scenes.forEach(function (s, i) {
      var b = el('button', null, { 'aria-current': String(i === sceneIndex) });
      b.appendChild(el('span', s.stateId + ' · ' + s.title));
      b.appendChild(el('small', s.captured ? s.assets.length + ' capture(s)' : 'missing'));
      b.onclick = function () { sceneIndex = i; render(); };
      nav.appendChild(b);
    });
  }
  function renderTabs() {
    var t = $('tabs'); t.textContent = '';
    viewports.forEach(function (v) { var b = el('button', v, { 'aria-pressed': String(v === viewport) }); b.onclick = function () { viewport = v; render(); }; t.appendChild(b); });
  }
  function renderStage() {
    var s = D.scenes[sceneIndex]; if (!s) return;
    $('scene').textContent = s.stateId + ' · ' + s.title; $('caption').textContent = s.caption;
    var stage = $('stage'); stage.textContent = '';
    var a = pickAsset(s);
    if (!a) stage.appendChild(el('p', 'Nothing captured for this state at ' + viewport + '.', { 'class': 'mute' }));
    else if ((a.contentType || '').indexOf('video/') === 0 || /\.mp4$/.test(a.src)) { var v = el('video', null, { src: a.src, controls: '', preload: 'metadata' }); if (a.poster) v.setAttribute('poster', a.poster); stage.appendChild(v); }
    else stage.appendChild(el('img', null, { src: a.src, alt: s.title + ' at ' + viewport }));
    var changes = $('changes'); changes.textContent = '';
    D.compare.forEach(function (c) {
      c.pairs.filter(function (p) { return p.stateId === s.stateId && (p.viewport || 'default') === viewport && p.status === 'changed'; }).forEach(function (p) {
        changes.appendChild(el('h3', 'Changed since ' + c.a + ' (' + (p.changedRatio * 100).toFixed(2) + '% of pixels)'));
        p.regions.forEach(function (r) { changes.appendChild(el('img', null, { src: r.key, alt: 'changed region' })); });
      });
    });
  }
  function render() { renderList(); renderTabs(); renderStage(); }
  var issues = []; if (D.missing.length) issues.push('Missing: ' + D.missing.join(', ')); if (D.reasons.length) issues.push('Reasons: ' + D.reasons.join(', '));
  $('issues').textContent = issues.join(' · ');
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') sceneIndex = Math.min(sceneIndex + 1, D.scenes.length - 1);
    else if (e.key === 'ArrowLeft') sceneIndex = Math.max(sceneIndex - 1, 0);
    else if (e.key === 'v') viewport = viewports[(viewports.indexOf(viewport) + 1) % viewports.length];
    else return;
    render();
  });
  render();
})();
</script></body></html>
`;
}
