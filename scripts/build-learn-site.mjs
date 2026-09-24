#!/usr/bin/env node
/**
 * Rebuild AgentSam /learn/ routes from the Architecture Field Manual donor.
 * Default donor: ~/Downloads/architecture_field_manual.html
 * Override: AGENTSAM_LEARN_SOURCE=/path/to/manual.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const donor =
  process.env.AGENTSAM_LEARN_SOURCE ||
  path.join(os.homedir(), 'Downloads/architecture_field_manual.html');

if (!fs.existsSync(donor)) {
  console.error(JSON.stringify({ ok: false, error: 'donor_missing', donor }));
  process.exit(1);
}

const html = fs.readFileSync(donor, 'utf8');
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
if (!bodyMatch) {
  console.error(JSON.stringify({ ok: false, error: 'no_body' }));
  process.exit(1);
}
const body = bodyMatch[1];
const sideMatch = body.match(/<div class="side"[^>]*>([\s\S]*?)<\/div>\s*<div class="main"/i);
const mainMatch =
  body.match(/<div class="main"[^>]*>([\s\S]*)<\/div>\s*<\/div>\s*$/i) ||
  body.match(/<div class="main"[^>]*>([\s\S]*)<\/div>/i);
const sideInner = sideMatch ? sideMatch[1] : '';
const mainInner = mainMatch ? mainMatch[1] : body;

const learnDir = path.join(root, 'apps/frontend/public/site/learn');
const manualDir = path.join(learnDir, 'architecture-field-manual');
fs.mkdirSync(manualDir, { recursive: true });

function shellHead(title, desc) {
  const g = '/site/global';
  return `<!doctype html>
<html lang="en" data-asbd-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  <meta name="agentsam:page" content="learn" />
  <meta name="agentsam:route" content="agentsam.inneranimalmedia.com/learn/" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${g}/asbd-tokens.css" />
  <script src="${g}/asbd-theme.js" defer></script>
`;
}

const toc = sideInner.replace(
  /<h1[^>]*>[\s\S]*?<\/h1>/i,
  '<p class="learn-manual-kicker">Architecture Field Manual</p>'
);

const indexHtml = `${shellHead('Learn — AgentSam', 'AgentSam learn hub: architecture field manual and package guides.', 1)}
  <style>
    body { margin:0; min-height:100vh; font-family:var(--asbd-font-sans); background:var(--asbd-surface); color:var(--asbd-text); }
    .asbd-doc { max-width:var(--asbd-layout-max); margin:0 auto; padding:calc(var(--asbd-header-height)+32px) 32px 80px; }
    .asbd-breadcrumb { display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:13px; font-weight:600; color:var(--asbd-text-muted); margin-bottom:28px; }
    .asbd-breadcrumb a { color:var(--asbd-text-muted); text-decoration:none; }
    .asbd-breadcrumb a:hover { color:var(--asbd-color-blue); }
    .asbd-breadcrumb [aria-current="page"] { color:var(--asbd-text); }
    .asbd-doc-toolbar { display:flex; justify-content:flex-end; margin-bottom:18px; }
    .asbd-theme-toggle { font:inherit; font-size:13px; font-weight:700; border-radius:10px; border:1px solid var(--asbd-border); background:var(--asbd-surface-elevated); color:var(--asbd-text); padding:8px 14px; cursor:pointer; }
    h1 { font-size:clamp(2rem,4vw,2.75rem); letter-spacing:-0.03em; margin:0 0 12px; }
    .lead { color:var(--asbd-text-muted); max-width:62ch; margin:0 0 28px; line-height:1.55; }
    .learn-grid { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); }
    .learn-card { display:block; text-decoration:none; color:inherit; background:var(--asbd-surface-elevated); border:1px solid var(--asbd-border); border-radius:var(--asbd-radius); padding:22px; }
    .learn-card:hover { border-color:rgba(22,123,252,0.45); }
    .learn-card h2 { margin:0 0 8px; font-size:1.1rem; color:var(--asbd-color-blue); }
    .learn-card p { margin:0; color:var(--asbd-text-muted); line-height:1.5; font-size:0.95rem; }
    code { font-family:var(--asbd-font-mono); font-size:0.92em; }
  </style>
</head>
<body data-asbd-theme="dark">
  <div id="asbd-header-mount"></div>
  <main class="asbd-doc">
    <div class="asbd-doc-toolbar">
      <button type="button" class="asbd-theme-toggle" id="asbdThemeToggle">Light theme</button>
    </div>
    <nav class="asbd-breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a><span aria-hidden="true">/</span>
      <span aria-current="page">Learn</span>
    </nav>
    <h1>Learn AgentSam</h1>
    <p class="lead">Public learn routes for <code>agentsam.inneranimalmedia.com/learn/</code> — manuals and package guides under the shared ASBD shell.</p>
    <div class="learn-grid">
      <a class="learn-card" href="./architecture-field-manual/">
        <h2>Architecture Field Manual</h2>
        <p>How to read mature repositories: packages, authority, RPC, persistence, CAD/scene data, and IDE/CLI systems.</p>
      </a>
      <a class="learn-card" href="/packages/sdk/help/">
        <h2>SDK Help</h2>
        <p>Copyable install commands for <code>@inneranimalmedia/agentsam-sdk</code>, synced on every publish.</p>
      </a>
      <a class="learn-card" href="/packages/sdk/setup-guide/">
        <h2>SDK Setup Guide</h2>
        <p>Minimum publishable doc pattern: install → login → inspect.</p>
      </a>
    </div>
  </main>
  <div id="asbd-footer-mount"></div>
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
      if (window.AsbdTheme) {
        AsbdTheme.syncFromDocument();
        AsbdTheme.bindToggle(document.getElementById('asbdThemeToggle'));
      }
    });
  })();
  </script>
</body>
</html>
`;

const pagesHtml = mainInner.replace(/class="page"/g, 'class="page learn-page"');

const manualHtml = `${shellHead('Architecture Field Manual — AgentSam Learn', 'Repository architecture field manual for AgentSam learn routes.')}
  <style>
    body { margin:0; min-height:100vh; font-family:var(--asbd-font-sans); background:var(--asbd-surface); color:var(--asbd-text); }
    .learn-shell { display:grid; grid-template-columns:280px minmax(0,1fr); max-width:1500px; margin:0 auto; min-height:100vh; padding-top:var(--asbd-header-height); }
    .learn-toc { position:sticky; top:var(--asbd-header-height); height:calc(100vh - var(--asbd-header-height)); overflow:auto; padding:28px 20px; background:var(--asbd-color-navy); color:rgba(255,255,255,0.88); border-right:1px solid rgba(255,255,255,0.08); }
    .learn-toc .learn-manual-kicker { font-size:13px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:var(--asbd-color-blue); margin:0 0 16px; }
    .learn-toc a { display:block; color:rgba(255,255,255,0.72); text-decoration:none; padding:6px 0; font-size:13px; font-weight:600; }
    .learn-toc a:hover { color:#fff; }
    .learn-main { padding:28px 32px 80px; }
    .asbd-doc-toolbar { display:flex; justify-content:flex-end; gap:10px; margin-bottom:18px; }
    .asbd-theme-toggle { font:inherit; font-size:13px; font-weight:700; border-radius:10px; border:1px solid var(--asbd-border); background:var(--asbd-surface-elevated); color:var(--asbd-text); padding:8px 14px; cursor:pointer; }
    .asbd-breadcrumb { display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:13px; font-weight:600; color:var(--asbd-text-muted); margin-bottom:22px; }
    .asbd-breadcrumb a { color:var(--asbd-text-muted); text-decoration:none; }
    .asbd-breadcrumb a:hover { color:var(--asbd-color-blue); }
    .asbd-breadcrumb [aria-current="page"] { color:var(--asbd-text); }
    .learn-page { max-width:980px; margin:0 auto 24px; background:var(--asbd-surface-elevated); padding:48px 52px; border:1px solid var(--asbd-border); border-radius:var(--asbd-radius); }
    .learn-page h1 { color:var(--asbd-text); font-size:clamp(1.8rem,3vw,2.4rem); line-height:1.1; margin-top:0; }
    .learn-page h2 { color:var(--asbd-color-blue); margin-top:32px; }
    .learn-page h3 { color:var(--asbd-text); }
    .learn-page p, .learn-page li { color:var(--asbd-text-muted); line-height:1.55; }
    .learn-page code, .learn-page pre { font-family:var(--asbd-font-mono); }
    .learn-page pre { background:rgba(10,22,40,0.06); padding:18px; border-left:4px solid var(--asbd-color-blue); overflow:auto; font-size:13px; }
    html[data-asbd-theme="dark"] .learn-page pre { background:rgba(255,255,255,0.05); }
    .learn-page .note { background:rgba(22,123,252,0.08); border-left:4px solid var(--asbd-color-blue); padding:15px 17px; margin:18px 0; font-style:italic; color:var(--asbd-text-muted); }
    .learn-page table { width:100%; border-collapse:collapse; font-size:14px; margin:15px 0; }
    .learn-page th, .learn-page td { border:1px solid var(--asbd-border); padding:9px; vertical-align:top; }
    .learn-page th { background:rgba(22,123,252,0.12); text-align:left; color:var(--asbd-text); }
    .learn-page .tag { font-size:12px; letter-spacing:.09em; text-transform:uppercase; color:var(--asbd-color-blue); font-weight:800; }
    .learn-page a { color:var(--asbd-color-blue); }
    @media (max-width:900px) {
      .learn-shell { display:block; }
      .learn-toc { position:relative; top:auto; height:auto; }
      .learn-page { padding:28px 22px; }
    }
    @media print {
      #asbd-header, #asbd-footer, .learn-toc, .asbd-doc-toolbar { display:none !important; }
      .learn-shell { display:block; padding-top:0; }
      .learn-page { box-shadow:none; border:0; }
    }
  </style>
</head>
<body data-asbd-theme="dark">
  <div id="asbd-header-mount"></div>
  <div class="learn-shell">
    <aside class="learn-toc" aria-label="Manual sections">${toc}</aside>
    <div class="learn-main">
      <div class="asbd-doc-toolbar">
        <button type="button" class="asbd-theme-toggle" id="asbdThemeToggle">Light theme</button>
      </div>
      <nav class="asbd-breadcrumb" aria-label="Breadcrumb">
        <a href="/learn/">Learn</a><span aria-hidden="true">/</span>
        <span aria-current="page">Architecture Field Manual</span>
      </nav>
      <div class="learn-pages">${pagesHtml}</div>
    </div>
  </div>
  <div id="asbd-footer-mount"></div>
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
      if (window.AsbdTheme) {
        AsbdTheme.syncFromDocument();
        AsbdTheme.bindToggle(document.getElementById('asbdThemeToggle'));
      }
    });
  })();
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(learnDir, 'index.html'), indexHtml);
fs.writeFileSync(path.join(manualDir, 'index.html'), manualHtml);
fs.copyFileSync(donor, path.join(manualDir, 'source.architecture_field_manual.html'));

console.log(
  JSON.stringify(
    {
      ok: true,
      donor: path.relative(root, donor) === donor ? donor : path.relative(os.homedir(), donor),
      wrote: [
        path.relative(root, path.join(learnDir, 'index.html')),
        path.relative(root, path.join(manualDir, 'index.html')),
      ],
      bytes: {
        index: fs.statSync(path.join(learnDir, 'index.html')).size,
        manual: fs.statSync(path.join(manualDir, 'index.html')).size,
      },
    },
    null,
    2
  )
);
