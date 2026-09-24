#!/usr/bin/env node
/**
 * Rebuild AgentSam /learn/ routes from the Architecture Field Manual donor.
 *
 * Donor resolution (first hit wins):
 *   1) AGENTSAM_LEARN_SOURCE
 *   2) apps/frontend/public/site/learn/architecture-field-manual/source.architecture_field_manual.html
 *   3) ~/Downloads/architecture_field_manual.html  (local authoring convenience only)
 *
 * Cloudflare Builds must use (2) — never Downloads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const learnDir = path.join(root, 'apps/frontend/public/site/learn');
const manualDir = path.join(learnDir, 'architecture-field-manual');
const committedDonor = path.join(manualDir, 'source.architecture_field_manual.html');
const downloadsDonor = path.join(os.homedir(), 'Downloads/architecture_field_manual.html');

const donorCandidates = [
  process.env.AGENTSAM_LEARN_SOURCE,
  committedDonor,
  downloadsDonor,
].filter(Boolean);

const donor = donorCandidates.find((p) => fs.existsSync(p));
if (!donor) {
  console.error(
    JSON.stringify({
      ok: false,
      error: 'donor_missing',
      tried: donorCandidates,
      hint: 'Commit source.architecture_field_manual.html under learn/architecture-field-manual/',
    })
  );
  process.exit(1);
}

const html = fs.readFileSync(donor, 'utf8');
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
if (!bodyMatch) {
  console.error(JSON.stringify({ ok: false, error: 'no_body', donor }));
  process.exit(1);
}
const body = bodyMatch[1];
const sideMatch = body.match(/<div class="side"[^>]*>([\s\S]*?)<\/div>\s*<div class="main"/i);
const mainMatch =
  body.match(/<div class="main"[^>]*>([\s\S]*)<\/div>\s*<\/div>\s*$/i) ||
  body.match(/<div class="main"[^>]*>([\s\S]*)<\/div>/i);
const sideInner = sideMatch ? sideMatch[1] : '';
const mainInner = mainMatch ? mainMatch[1] : body;

fs.mkdirSync(manualDir, { recursive: true });

// Keep committed donor in sync when rebuilding from Downloads / override
if (path.resolve(donor) !== path.resolve(committedDonor)) {
  fs.copyFileSync(donor, committedDonor);
}

function shellHead(title, desc) {
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
  <link rel="stylesheet" href="/site/global/asbd-tokens.css" />
  <script src="/site/global/asbd-theme.js" defer></script>
`;
}

function injectShellScript(headerUrl, footerUrl) {
  return `<script>
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
      inject('asbd-header-mount', '${headerUrl}'),
      inject('asbd-footer-mount', '${footerUrl}')
    ]).then(function () {
      if (window.AsbdTheme) {
        AsbdTheme.syncFromDocument();
        AsbdTheme.bindToggle(document.getElementById('asbdThemeToggle'));
      }
    });
  })();
  </script>`;
}

const toc = sideInner
  .replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '')
  .replace(/<p[^>]*>[\s\S]*?<\/p>/i, '');

const indexHtml = `${shellHead('Learn — AgentSam', 'AgentSam learn hub: architecture field manual and package guides.')}
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
    .learn-card { display:block; text-decoration:none; color:inherit; background:var(--asbd-surface-elevated); border:1px solid var(--asbd-border); border-radius:var(--asbd-radius); padding:22px; transition:border-color .2s ease; }
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
    <p class="lead">Field manuals and package guides for <code>agentsam.inneranimalmedia.com/learn/</code> — shared ASBD shell, CMS-editable body content under WEBSITE_ASSETS.</p>
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
        <p>Minimum publishable doc pattern: install → verify → inspect.</p>
      </a>
    </div>
  </main>
  <div id="asbd-footer-mount"></div>
  ${injectShellScript('/site/global/asbd-header.html', '/site/global/asbd-footer.html')}
</body>
</html>
`;

const pagesHtml = mainInner
  .replace(/class="page"/g, 'class="page learn-page"')
  .replace(/class="page repos"/g, 'class="page learn-page learn-page--repos"');

const manualHtml = `${shellHead('Architecture Field Manual — AgentSam Learn', 'How to read, design and reason about mature software systems.')}
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--asbd-font-sans);
      background: var(--asbd-surface);
      color: var(--asbd-text);
    }
    .learn-shell {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      max-width: 1500px;
      margin: 0 auto;
      min-height: 100vh;
      padding-top: var(--asbd-header-height);
    }
    .learn-toc {
      position: sticky;
      top: var(--asbd-header-height);
      height: calc(100vh - var(--asbd-header-height));
      overflow: auto;
      padding: 28px 20px 40px;
      background: var(--asbd-color-navy);
      color: rgba(255,255,255,0.88);
      border-right: 1px solid rgba(255,255,255,0.08);
    }
    .learn-toc-brand {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 22px;
      padding-bottom: 18px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .learn-toc-brand .kicker {
      margin: 0;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--asbd-color-blue);
    }
    .learn-toc-brand h1 {
      margin: 0;
      font-size: 1.15rem;
      line-height: 1.25;
      letter-spacing: -0.02em;
      color: #fff;
    }
    .learn-toc-brand .meta {
      margin: 0;
      font-size: 12px;
      color: rgba(255,255,255,0.45);
    }
    .learn-toc a {
      display: block;
      color: rgba(255,255,255,0.68);
      text-decoration: none;
      padding: 8px 10px;
      margin: 0 0 2px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.35;
    }
    .learn-toc a:hover {
      color: #fff;
      background: rgba(22,123,252,0.16);
    }
    .learn-main { padding: 28px 32px 80px; }
    .asbd-doc-toolbar { display:flex; justify-content:flex-end; gap:10px; margin-bottom:18px; }
    .asbd-theme-toggle {
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      border-radius: 10px;
      border: 1px solid var(--asbd-border);
      background: var(--asbd-surface-elevated);
      color: var(--asbd-text);
      padding: 8px 14px;
      cursor: pointer;
    }
    .asbd-breadcrumb {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      font-size: 13px;
      font-weight: 600;
      color: var(--asbd-text-muted);
      margin-bottom: 22px;
    }
    .asbd-breadcrumb a { color: var(--asbd-text-muted); text-decoration: none; }
    .asbd-breadcrumb a:hover { color: var(--asbd-color-blue); }
    .asbd-breadcrumb [aria-current="page"] { color: var(--asbd-text); }

    .learn-page {
      max-width: 980px;
      margin: 0 auto 28px;
      background: var(--asbd-surface-elevated);
      padding: 48px 52px;
      border: 1px solid var(--asbd-border);
      border-radius: calc(var(--asbd-radius) + 4px);
      box-shadow: 0 18px 40px rgba(10, 22, 40, 0.08);
    }
    .learn-page .tag {
      display: inline-block;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--asbd-color-blue);
      font-weight: 800;
      margin-bottom: 14px;
    }
    .learn-page h1 {
      color: var(--asbd-text);
      font-size: clamp(1.85rem, 3vw, 2.45rem);
      line-height: 1.1;
      letter-spacing: -0.03em;
      margin: 0 0 14px;
    }
    .learn-page h2 {
      color: var(--asbd-color-blue);
      margin-top: 32px;
      letter-spacing: -0.02em;
    }
    .learn-page h3 { color: var(--asbd-text); }
    .learn-page p,
    .learn-page li {
      color: var(--asbd-text-muted);
      line-height: 1.6;
    }
    .learn-page strong { color: var(--asbd-text); }
    .learn-page code,
    .learn-page pre { font-family: var(--asbd-font-mono); }
    .learn-page pre {
      background: rgba(10, 22, 40, 0.04);
      padding: 18px 20px;
      border-left: 4px solid var(--asbd-color-blue);
      border-radius: 0 10px 10px 0;
      overflow: auto;
      font-size: 13px;
      color: var(--asbd-text);
    }
    html[data-asbd-theme="dark"] .learn-page pre {
      background: rgba(255,255,255,0.04);
    }
    .learn-page .note {
      background: rgba(22,123,252,0.08);
      border-left: 4px solid var(--asbd-color-blue);
      border-radius: 0 12px 12px 0;
      padding: 15px 17px;
      margin: 18px 0;
      font-style: italic;
      color: var(--asbd-text-muted);
    }
    .learn-page table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      margin: 15px 0;
    }
    .learn-page th,
    .learn-page td {
      border: 1px solid var(--asbd-border);
      padding: 10px 12px;
      vertical-align: top;
    }
    .learn-page th {
      background: rgba(22,123,252,0.12);
      text-align: left;
      color: var(--asbd-text);
      font-weight: 700;
    }
    .learn-page a { color: var(--asbd-color-blue); }
    .learn-page ul { padding-left: 1.15rem; }

    @media (max-width: 900px) {
      .learn-shell { display: block; }
      .learn-toc {
        position: relative;
        top: auto;
        height: auto;
        border-right: 0;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .learn-page { padding: 28px 22px; }
    }
    @media print {
      #asbd-header, #asbd-footer, .learn-toc, .asbd-doc-toolbar { display: none !important; }
      .learn-shell { display: block; padding-top: 0; }
      .learn-page { box-shadow: none; border: 0; break-after: page; }
    }
  </style>
</head>
<body data-asbd-theme="dark">
  <div id="asbd-header-mount"></div>
  <div class="learn-shell">
    <aside class="learn-toc" aria-label="Manual sections">
      <div class="learn-toc-brand">
        <p class="kicker">AgentSam Learn</p>
        <h1>Architecture Field Manual</h1>
        <p class="meta">Browser companion · Sep 2026</p>
      </div>
      ${toc}
    </aside>
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
  ${injectShellScript('/site/global/asbd-header.html', '/site/global/asbd-footer.html')}
</body>
</html>
`;

fs.writeFileSync(path.join(learnDir, 'index.html'), indexHtml);
fs.writeFileSync(path.join(manualDir, 'index.html'), manualHtml);

console.log(
  JSON.stringify(
    {
      ok: true,
      donor: path.relative(root, donor),
      wrote: [
        path.relative(root, path.join(learnDir, 'index.html')),
        path.relative(root, path.join(manualDir, 'index.html')),
        path.relative(root, committedDonor),
      ],
      bytes: {
        index: fs.statSync(path.join(learnDir, 'index.html')).size,
        manual: fs.statSync(path.join(manualDir, 'index.html')).size,
        source: fs.statSync(committedDonor).size,
      },
    },
    null,
    2
  )
);
