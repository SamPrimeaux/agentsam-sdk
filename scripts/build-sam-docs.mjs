#!/usr/bin/env node
/**
 * Rebuild AgentSam /docs/sam/* public pages.
 *
 * - Copies @inneranimalmedia/agentsam-docs-theme CSS into site/global
 * - Assembles each guide from `_sections/*.html` (CMS/R2 code sections)
 * - Wraps shared ASBD header/footer mounts + violet skin
 *
 * Run: node scripts/build-sam-docs.mjs
 * Also invoked from site:sync.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.join(root, 'apps/frontend/public/site');
const docsRoot = path.join(siteRoot, 'docs/sam');
const themePkg = path.join(root, 'packages/agentsam-docs-theme');
const globalDir = path.join(siteRoot, 'global');

function copyThemeAssets() {
  fs.mkdirSync(globalDir, { recursive: true });
  for (const file of ['tokens.css', 'docs-layout.css']) {
    const from = path.join(themePkg, file);
    const to = path.join(globalDir, file === 'tokens.css' ? 'agentsam-docs-tokens.css' : 'agentsam-docs-layout.css');
    fs.copyFileSync(from, to);
  }
}

function readSections(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.html'))
    .sort()
    .map((name) => ({
      id: name.replace(/\.html$/, '').replace(/^\d+-/, ''),
      name,
      html: fs.readFileSync(path.join(dir, name), 'utf8'),
    }));
}

function shellPage({
  title,
  description,
  canonicalPath,
  pageId,
  crumb,
  navHtml,
  tocHtml,
  articleHtml,
  jsonLd,
}) {
  const canonical = `https://agentsam.inneranimalmedia.com${canonicalPath}`;
  return `<!doctype html>
<html lang="en" data-asbd-theme="dark" data-asbd-skin="violet">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="color-scheme" content="dark" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${canonical}" />
  <meta name="agentsam:page" content="${pageId}" />
  <meta name="agentsam:cms-editable" content="true" />
  <meta name="agentsam:route" content="agentsam.inneranimalmedia.com${canonicalPath}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/site/global/asbd-tokens.css" />
  <link rel="stylesheet" href="/site/global/agentsam-docs-tokens.css" />
  <link rel="stylesheet" href="/site/global/agentsam-docs-layout.css" />
  <script src="/site/global/asbd-theme.js" defer></script>
  ${jsonLd ? `<script type="application/ld+json">\n${jsonLd}\n  </script>` : ''}
</head>
<body data-asbd-theme="dark">
  <div id="asbd-header-mount" data-cms-region="header"></div>

  <div class="agentsam-docs">
    <div class="agentsam-docs-layout">
      <aside class="agentsam-docs-sidebar" data-cms-region="sidebar">
        <div class="agentsam-docs-brand">
          <div class="agentsam-docs-mark">A</div>
          <div><b>AgentSam</b><span>SAM engineering guides</span></div>
        </div>
        <div class="agentsam-docs-search">
          <input id="docs-search" type="search" placeholder="Search…" aria-label="Search this guide" />
        </div>
        <nav class="agentsam-docs-nav" id="docs-nav">${navHtml}</nav>
      </aside>

      <main class="agentsam-docs-main">
        <div class="agentsam-docs-topbar">
          <div class="agentsam-docs-crumb">${crumb}</div>
          <div class="agentsam-docs-spacer"></div>
          <button type="button" class="agentsam-docs-action" id="docs-copy-page">Copy page</button>
        </div>
        <article class="agentsam-docs-article" id="docs-article" data-cms-region="body">
${articleHtml}
        </article>
      </main>

      <aside class="agentsam-docs-toc" data-cms-region="toc">
        <h4>On this page</h4>
        ${tocHtml}
      </aside>
    </div>
  </div>

  <div id="asbd-footer-mount" data-cms-region="footer"></div>

  <script>
  (function () {
    function inject(id, url) {
      var slot = document.getElementById(id);
      if (!slot) return;
      fetch(url, { credentials: 'same-origin' })
        .then(function (r) { return r.text(); })
        .then(function (html) {
          slot.innerHTML = html;
          slot.querySelectorAll('script').forEach(function (old) {
            var s = document.createElement('script');
            if (old.src) s.src = old.src;
            else s.textContent = old.textContent;
            old.replaceWith(s);
          });
        })
        .catch(function () {});
    }
    inject('asbd-header-mount', '/site/global/asbd-header.html');
    inject('asbd-footer-mount', '/site/global/asbd-footer.html');

    var copy = document.getElementById('docs-copy-page');
    if (copy) {
      copy.addEventListener('click', async function () {
        try {
          await navigator.clipboard.writeText(document.getElementById('docs-article').innerText);
          copy.textContent = 'Copied';
          setTimeout(function () { copy.textContent = 'Copy page'; }, 1200);
        } catch (_) {
          copy.textContent = 'Copy unavailable';
          setTimeout(function () { copy.textContent = 'Copy page'; }, 1400);
        }
      });
    }

    document.querySelectorAll('.copy-code').forEach(function (button) {
      button.addEventListener('click', async function () {
        var block = button.closest('.code').querySelector('pre');
        try {
          await navigator.clipboard.writeText(block.innerText);
          var prior = button.textContent;
          button.textContent = 'Copied';
          setTimeout(function () { button.textContent = prior; }, 1000);
        } catch (_) {
          button.textContent = 'Unavailable';
        }
      });
    });

    var search = document.getElementById('docs-search');
    var navLinks = Array.prototype.slice.call(document.querySelectorAll('#docs-nav a'));
    if (search) {
      search.addEventListener('input', function () {
        var q = search.value.trim().toLowerCase();
        navLinks.forEach(function (a) {
          a.style.display = !q || a.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
        });
      });
    }

    var sections = Array.prototype.slice.call(document.querySelectorAll('section[id]'));
    var allLinks = Array.prototype.slice.call(document.querySelectorAll('a[href^="#"]'));
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        var visible = entries.filter(function (e) { return e.isIntersecting; })
          .sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; })[0];
        if (!visible) return;
        allLinks.forEach(function (a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + visible.target.id);
        });
      }, { rootMargin: '-18% 0px -68% 0px', threshold: [0, 0.08, 0.25] });
      sections.forEach(function (section) { observer.observe(section); });
    }
  })();
  </script>
</body>
</html>
`;
}

function navFromItems(groups) {
  return groups
    .map((group) => {
      const links = group.items
        .map(
          (item, index) =>
            `<a href="#${item.id}"${index === 0 && group === groups[0] ? ' class="active"' : ''}>${item.label}</a>`,
        )
        .join('\n');
      return `<div class="group">${group.label}</div>\n${links}`;
    })
    .join('\n');
}

function tocFromItems(items) {
  return items.map((item) => `<a href="#${item.id}">${item.label}</a>`).join('\n');
}

function buildGuide({ slug, title, description, crumb, navGroups, tocItems, pageId }) {
  const sectionsDir = path.join(docsRoot, slug, '_sections');
  const sections = readSections(sectionsDir);
  if (!sections.length) {
    throw new Error(`No sections for ${slug} in ${sectionsDir}`);
  }
  const articleHtml = sections
    .map((section) => {
      // Preserve authoring markup; stamp CMS section id when missing.
      if (/data-cms-section=/.test(section.html)) return section.html.trim();
      return section.html.replace(
        /<section(\s[^>]*id="([^"]+)")/i,
        `<section data-cms-section="$2"$1`,
      ).trim();
    })
    .join('\n\n');

  const html = shellPage({
    title,
    description,
    canonicalPath: `/docs/sam/${slug}`,
    pageId,
    crumb,
    navHtml: navFromItems(navGroups),
    tocHtml: `${tocFromItems(tocItems)}\n<div class="sep"></div>\n<div class="note">Public AgentSam guide. Shared ASBD header/footer · violet docs theme.</div>`,
    articleHtml,
    jsonLd: JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: title,
        description,
        author: { '@type': 'Organization', name: 'AgentSam' },
        publisher: { '@type': 'Organization', name: 'InnerAnimalMedia' },
        mainEntityOfPage: `https://agentsam.inneranimalmedia.com/docs/sam/${slug}`,
      },
      null,
      2,
    ),
  });

  const outDir = path.join(docsRoot, slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  return { slug, sections: sections.length, out: path.join(outDir, 'index.html') };
}

function buildHub() {
  const html = `<!doctype html>
<html lang="en" data-asbd-theme="dark" data-asbd-skin="violet">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>SAM Docs · AgentSam</title>
  <meta name="description" content="AgentSam Systematic Autonomous Machinery — public engineering guides." />
  <link rel="canonical" href="https://agentsam.inneranimalmedia.com/docs/sam" />
  <meta name="agentsam:page" content="docs.sam.hub" />
  <link rel="stylesheet" href="/site/global/asbd-tokens.css" />
  <link rel="stylesheet" href="/site/global/agentsam-docs-tokens.css" />
  <link rel="stylesheet" href="/site/global/agentsam-docs-layout.css" />
  <script src="/site/global/asbd-theme.js" defer></script>
  <style>
    .hub { max-width: 920px; margin: 0 auto; padding: calc(var(--asbd-header-height) + 48px) 28px 96px; }
    .hub h1 { font-size: clamp(2.4rem, 5vw, 3.4rem); letter-spacing: -.05em; margin: 10px 0 14px; }
    .hub .lead { color: var(--docs-muted); font-size: 1.15rem; max-width: 62ch; }
    .hub-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 36px; }
    .hub-card {
      display: block; padding: 22px; border-radius: 16px;
      border: 1px solid var(--docs-border); background: linear-gradient(180deg, var(--docs-surface), #0d0d0f);
      transition: border-color .15s ease, transform .15s ease;
    }
    .hub-card:hover { border-color: var(--docs-accent-line); transform: translateY(-1px); }
    .hub-card b { display: block; font-size: 1.05rem; margin-bottom: 8px; }
    .hub-card span { color: var(--docs-muted); font-size: 14px; line-height: 1.5; }
    .hub-card .path { display: block; margin-top: 14px; font: 11px var(--docs-mono); color: var(--docs-accent-2); }
    @media (max-width: 720px) { .hub-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body data-asbd-theme="dark">
  <div id="asbd-header-mount" data-cms-region="header"></div>
  <main class="agentsam-docs hub" data-cms-region="body">
    <div class="eyebrow">Systematic Autonomous Machinery</div>
    <h1>SAM docs</h1>
    <p class="lead">Public guides for AgentSam’s machine layer — structured decisions, infrastructure cookbooks, and how the primitives become product behavior.</p>
    <div class="hub-grid">
      <a class="hub-card" href="/docs/sam/structured-decisions/">
        <b>Structured decisions</b>
        <span>Typed choose / score / gate / confidence primitives for coding-agent workflows.</span>
        <span class="path">/docs/sam/structured-decisions</span>
      </a>
      <a class="hub-card" href="/docs/sam/infrastructure-cookbooks/">
        <b>Infrastructure cookbooks</b>
        <span>Hands-on drills for Merkle, AST, GOAP, retrieval, security, terminals, and release proof.</span>
        <span class="path">/docs/sam/infrastructure-cookbooks</span>
      </a>
      <a class="hub-card" href="/docs/sam/native-runtime/">
        <b>Native Go runtime</b>
        <span>Local, Cloudflare, deployment proof, and how the native runtime graduates toward agentsamd.</span>
        <span class="path">/docs/sam/native-runtime</span>
      </a>
    </div>
  </main>
  <div id="asbd-footer-mount" data-cms-region="footer"></div>
  <script>
  (function () {
    function inject(id, url) {
      var slot = document.getElementById(id);
      if (!slot) return;
      fetch(url, { credentials: 'same-origin' })
        .then(function (r) { return r.text(); })
        .then(function (html) {
          slot.innerHTML = html;
          slot.querySelectorAll('script').forEach(function (old) {
            var s = document.createElement('script');
            if (old.src) s.src = old.src; else s.textContent = old.textContent;
            old.replaceWith(s);
          });
        }).catch(function () {});
    }
    inject('asbd-header-mount', '/site/global/asbd-header.html');
    inject('asbd-footer-mount', '/site/global/asbd-footer.html');
  })();
  </script>
</body>
</html>
`;
  fs.mkdirSync(docsRoot, { recursive: true });
  fs.writeFileSync(path.join(docsRoot, 'index.html'), html);
}

copyThemeAssets();

const structured = buildGuide({
  slug: 'structured-decisions',
  title: 'Structured decisions with coding agents · AgentSam',
  description:
    'AgentSam-native guide to typed decision primitives, confidence gates, utility scoring, routing, and planning inside coding-agent workflows.',
  pageId: 'docs.sam.structured-decisions',
  crumb: '<span>Docs</span> <span aria-hidden="true">/</span> <span>SAM</span> <span aria-hidden="true">/</span> <strong>Structured decisions</strong>',
  navGroups: [
    {
      label: 'Get started',
      items: [
        { id: 'intro', label: 'Structured decisions' },
        { id: 'not-an-llm', label: 'Not another chat model' },
        { id: 'where-it-fits', label: 'Where it fits' },
      ],
    },
    {
      label: 'Primitives',
      items: [
        { id: 'state', label: 'State' },
        { id: 'choice', label: 'Choice' },
        { id: 'score', label: 'Score' },
        { id: 'gate', label: 'Gate' },
        { id: 'confidence', label: 'Confidence' },
      ],
    },
    {
      label: 'Patterns',
      items: [
        { id: 'intent-routing', label: 'Intent routing' },
        { id: 'utility', label: 'Utility scoring' },
        { id: 'goap', label: 'GOAP action selection' },
        { id: 'retrieval', label: 'Retrieval routing' },
        { id: 'terminal', label: 'Terminal lane selection' },
        { id: 'approval', label: 'Approval gates' },
      ],
    },
    {
      label: 'AgentSam use',
      items: [
        { id: 'skills', label: 'Skill selection' },
        { id: 'models', label: 'Model routing' },
        { id: 'packages', label: 'Package/deploy gates' },
        { id: 'rules', label: 'Design rules' },
      ],
    },
  ],
  tocItems: [
    { id: 'not-an-llm', label: 'Not another chat model' },
    { id: 'where-it-fits', label: 'Where it fits' },
    { id: 'state', label: 'State' },
    { id: 'choice', label: 'Choice' },
    { id: 'score', label: 'Score' },
    { id: 'gate', label: 'Gate' },
    { id: 'confidence', label: 'Confidence' },
    { id: 'intent-routing', label: 'Intent routing' },
    { id: 'utility', label: 'Utility scoring' },
    { id: 'goap', label: 'GOAP' },
    { id: 'terminal', label: 'Terminal lanes' },
    { id: 'skills', label: 'Skill selection' },
    { id: 'models', label: 'Model routing' },
    { id: 'rules', label: 'Design rules' },
  ],
});

const cookbooks = buildGuide({
  slug: 'infrastructure-cookbooks',
  title: 'SAM Infrastructure Cookbooks · AgentSam',
  description:
    "Hands-on infrastructure cookbooks for testing AgentSam's Systematic Autonomous Machinery: Merkle, AST, retrieval, GOAP, security, terminals, and recovery.",
  pageId: 'docs.sam.infrastructure-cookbooks',
  crumb: '<span>Docs</span> <span aria-hidden="true">/</span> <span>SAM</span> <span aria-hidden="true">/</span> <strong>Infrastructure cookbooks</strong>',
  navGroups: [
    {
      label: 'Overview',
      items: [
        { id: 'start', label: 'Start here' },
        { id: 'principle', label: 'How to test SAM' },
        { id: 'scorecard', label: 'Scorecard' },
      ],
    },
    {
      label: 'Cookbooks',
      items: [
        { id: 'baseline', label: 'Baseline perception' },
        { id: 'merkle', label: 'Merkle delta' },
        { id: 'blast-radius', label: 'AST blast radius' },
        { id: 'retrieval', label: 'Retrieval routing' },
        { id: 'goap', label: 'GOAP proof' },
        { id: 'release', label: 'Release torture test' },
        { id: 'security', label: 'Security boundary drill' },
        { id: 'terminals', label: 'Terminal equivalence' },
        { id: 'recovery', label: 'Failure recovery' },
        { id: 'stress', label: 'Massive infra stress test' },
      ],
    },
    {
      label: 'Operator',
      items: [
        { id: 'agent-prompt', label: 'Agent instruction' },
        { id: 'success', label: 'What good looks like' },
      ],
    },
  ],
  tocItems: [
    { id: 'start', label: 'Overview' },
    { id: 'principle', label: 'How to test SAM' },
    { id: 'baseline', label: 'Baseline perception' },
    { id: 'merkle', label: 'Merkle delta' },
    { id: 'blast-radius', label: 'AST blast radius' },
    { id: 'retrieval', label: 'Retrieval routing' },
    { id: 'goap', label: 'GOAP proof' },
    { id: 'release', label: 'Release torture test' },
    { id: 'security', label: 'Security drill' },
    { id: 'terminals', label: 'Terminal equivalence' },
    { id: 'recovery', label: 'Failure recovery' },
    { id: 'stress', label: 'Infra stress test' },
    { id: 'agent-prompt', label: 'Operator prompt' },
    { id: 'scorecard', label: 'Scorecard' },
    { id: 'success', label: 'What good looks like' },
  ],
});

buildHub();

console.log(
  JSON.stringify(
    {
      ok: true,
      theme: ['agentsam-docs-tokens.css', 'agentsam-docs-layout.css'],
      guides: [structured, cookbooks],
      hub: path.join(docsRoot, 'index.html'),
    },
    null,
    2,
  ),
);
