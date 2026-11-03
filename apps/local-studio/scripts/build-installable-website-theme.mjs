#!/usr/bin/env node
/**
 * Package a released first-party website as an editable CMS theme project.
 * Source authority: immutable Theme Store release ZIP + the original package
 * CMS manifest. Browser rendering only extracts the existing site's DOM; it
 * never invents a landing page or substitutes a preview.
 *
 * Run: node scripts/build-installable-website-theme.mjs plain-jane
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const slug = process.argv[2];
if (!/^[a-z][a-z0-9-]{0,63}$/.test(slug || '')) throw Error('Usage: build-installable-website-theme.mjs <theme-slug>');
const source = join(root, 'packages', 'theme-' + slug);
const pkg = JSON.parse(await readFile(join(source,'package.json'),'utf8'));
const version = pkg.version;
const siteRoot = join(source,'site');
const manifests = (await readdir(siteRoot)).filter(name=>name.endsWith('-cms-manifest.json'));
if(manifests.length!==1)throw Error('expected_one_source_cms_manifest_for_theme');
const sourceManifestName=manifests[0];
const manifestPath=join(siteRoot,sourceManifestName);
const localManifest = await readFile(manifestPath);
const manifest = JSON.parse(localManifest.toString());
if (manifest.theme !== slug || manifest.schema !== 'agentsam.cms-source-manifest.v1' ||
    !Array.isArray(manifest.pages) || !manifest.pages.length) throw Error('source_cms_manifest_invalid');

const origin = 'https://themes.inneranimalmedia.com';
const catalogResponse = await fetch(origin+'/api/catalog', { headers: { accept: 'application/json' } });
if (!catalogResponse.ok) throw Error('theme_store_catalog_unavailable');
const catalog = await catalogResponse.json();
const listing = catalog.products?.find(p => p.slug === slug && p.version === version);
const sha = listing?.release?.sha256;
if (listing?.release?.status !== 'published' || !/^[a-f0-9]{64}$/.test(sha || '') ||
    listing.release.storageKey !== 'releases/'+slug+'/'+version+'/'+sha+'.zip') {
  throw Error('theme_package_not_published_or_release_invalid');
}
const zippedResponse = await fetch(origin+'/api/themes/'+slug+'/'+version+'/download');
if (!zippedResponse.ok) throw Error('released_theme_package_unavailable');
const zip = Buffer.from(await zippedResponse.arrayBuffer());
if (zip.length > 32*1024*1024 || createHash('sha256').update(zip).digest('hex') !== sha)
  throw Error('theme_release_checksum_mismatch');
const temp = await mkdtemp(join(tmpdir(),'iam-theme-install-'));
let browser;
try {
  const zipPath = join(temp,'release.zip');
  await writeFile(zipPath,zip);
  const result = spawnSync('unzip',['-p',zipPath,'site/'+sourceManifestName],{
    encoding:null, maxBuffer:8*1024*1024,
  });
  if (result.status !== 0 || !result.stdout || !Buffer.from(result.stdout).equals(localManifest))
    throw Error('published_package_does_not_match_first_party_cms_manifest');

  const base = origin+'/theme-packages/'+slug+'/'+version+'/preview/';
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage({ viewport:{width:1440,height:960}, deviceScaleFactor:1 });
  const extractor = await readFile(join(root,'apps/ecommerce-cms-agentsam/frontend/theme-editor/project.mjs'),'utf8');
  await page.route('**/__agentsam_install_extract.mjs', route => route.fulfill({
    status:200, contentType:'text/javascript', body:extractor,
  }));
  const pages = [];
  const sourceRoutesNotRendered = [];
  for (const descriptor of manifest.pages) {
    const routePath = String(descriptor.path || '').replace(/^\/+/, '');
    if (routePath.split('/').includes('..')) throw Error('theme_route_escapes_source');
    const response = await page.goto(base+routePath, {waitUntil:'networkidle',timeout:30000});
    if (!response?.ok()) throw Error('theme_page_unavailable: '+routePath);
    const originalMain = await page.locator('main').first().isVisible().catch(() => false);
    if (!originalMain) {
      // Not every route declared by a CMS manifest actually renders yet.
      // Never invent page content just to satisfy a package page count.
      console.warn('[theme-install] skipping unrendered source route:',routePath);
      sourceRoutesNotRendered.push(routePath);
      continue;
    }
    const output = await page.evaluate(async ({ slug, title, base }) => {
      // Source content is the rendered, original React website at its
      // published version. Remove hydration scripts: the authoring renderer
      // owns edits, and React must never overwrite them on preview.
      const doc = document.documentElement.cloneNode(true);
      doc.querySelectorAll('script').forEach(node => node.remove());
      const html = '<!DOCTYPE html>'+doc.outerHTML;
      const {extractThemePage}=await import('/__agentsam_install_extract.mjs');
      const projectPage=extractThemePage(html,{slug,title,baseUrl:base});
      return {projectPage,visibleText:document.querySelector('main')?.innerText?.trim().slice(0,100)};
    }, {slug:descriptor.source_slug || descriptor.slug,title:descriptor.title,base});
    const p = output.projectPage;
    if (!p?.sections?.length || !p.sections.some(s=>(s.schema?.fields?.length||0)>0 ||
        (s.schema?.blocks||[]).some(b=>b.fields?.length))) {
      throw Error('released_page_is_not_editable: '+routePath+' '+output.visibleText);
    }
    if (pages.some(existing=>existing.slug===p.slug)) throw Error('duplicate_cms_page_slug: '+p.slug);
    pages.push(p);
    console.log('[theme-install] source page',p.slug,'sections',p.sections.length,
      'fields',p.sections.reduce((n,s)=>n+(s.schema.fields?.length||0),0));
  }
  const project = {
    schema:'agentsam.theme-project.v1',
    id:'theme_'+slug,
    name:pkg.agentsam?.store?.name || listing.name || slug,
    pages, tokens:{},
    sourceThemeId:slug,
    sourcePackage:pkg.name,
    sourcePackageVersion:version,
    sourcePreviewUrl:base,
    sourceReleaseSha256:sha,
    sourceCmsManifestSchema:manifest.schema,
    sourceManifestPageCount:manifest.pages.length,
    sourceRoutesNotRendered,
    revision:0, version:'0.1.0',
  };
  const bytes = Buffer.from(JSON.stringify(project));
  if (bytes.length > 8*1024*1024) throw Error('theme_project_too_large');
  const destination = join(root,'apps/ecommerce-cms-agentsam/frontend/static/data/site-theme-projects');
  await mkdir(destination,{recursive:true});
  await writeFile(join(destination,slug+'-'+version+'.json'),JSON.stringify(project,null,2)+'\n');
  const indexPath = join(destination,'index.json');
  let prior = [];
  try {
    const existing = JSON.parse(await readFile(indexPath,'utf8'));
    if (existing.schema === 'agentsam.website-theme-install-index.v1' && Array.isArray(existing.packages))
      prior = existing.packages;
  } catch {}
  const ready = {
    slug, version, sha256:sha, page_count:pages.length,
    manifest_page_count:manifest.pages.length,
    project_asset:'/ecommerce-cms-agentsam/admin/data/site-theme-projects/'+slug+'-'+version+'.json',
  };
  await writeFile(indexPath,JSON.stringify({
    schema:'agentsam.website-theme-install-index.v1',
    packages:[...prior.filter(item=>item.slug!==slug || item.version!==version),ready]
      .sort((a,b)=>a.slug.localeCompare(b.slug)),
  },null,2)+'\n');
  console.log('[theme-install] generated published editable project:',slug,version,sha,
    pages.length+' pages',bytes.length+' bytes');
} finally {
  await browser?.close();
  await rm(temp,{recursive:true,force:true});
}
