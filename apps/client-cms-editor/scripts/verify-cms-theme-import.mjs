#!/usr/bin/env node
/**
 * Real theme import acceptance — donor directory/zip → ThemePack → SQLite →
 * multipage localhost public routes + /cms → draft/publish proof.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const donorDir = join(packageRoot, 'fixtures/donor-themes/church-site');

async function load(rel) {
  return import(pathToFileURL(join(packageRoot, rel)).href);
}

function zipDonor(destZip) {
  const result = spawnSync('zip', ['-qr', destZip, '.'], {
    cwd: donorDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`zip fixture failed: ${result.stderr || result.stdout || result.status}`);
  }
}

async function main() {
  assert.ok(existsSync(join(donorDir, 'site/index.html')), 'church-site donor fixture missing');

  const importMod = await load('dist/import/index.js');
  const { SqliteCmsAdapter } = await load('dist/sqlite-adapter.js');
  const root = await load('dist/index.js');
  const { startLocalCmsRuntime } = await load('dist/local/index.js');
  assert.ok(importMod.importThemeFromSource);
  assert.ok(importMod.createLocalDevAuthHost);
  assert.ok(importMod.isCmsProtectedPath('/cms'));

  const work = mkdtempSync(join(tmpdir(), 'cms-theme-import-'));
  const packOut = join(work, 'theme-pack');
  const dbPath = join(work, 'cms.sqlite');
  const zipPath = join(work, 'church-site.zip');

  try {
    const pack = importMod.importThemeFromSource(donorDir, { outDir: packOut, packId: 'church-site' });
    assert.equal(pack.manifest.schema, 'agentsam.theme-pack.v1');
    assert.ok(pack.manifest.pages.includes('/'), 'home route required');
    assert.ok(pack.manifest.pages.length >= 3, 'imported theme must expose multiple pages');
    assert.ok(existsSync(join(packOut, 'manifest.json')));
    assert.ok(existsSync(join(packOut, 'starter-pack.json')));
    assert.ok(existsSync(join(packOut, 'provenance.json')));
    assert.equal(pack.starterPack.provenance.kind, 'imported');

    zipDonor(zipPath);
    const zipPack = importMod.importThemeFromSource(zipPath, {
      outDir: join(work, 'theme-pack-zip'),
      packId: 'church-site-zip',
    });
    assert.ok(zipPack.manifest.pages.length >= 3, 'zip import must yield multiple pages');

    let adapter = new SqliteCmsAdapter(dbPath);
    try {
      const installed = await root.installStarterPack(adapter, pack.starterPack, { siteId: 'church-site' });
      assert.ok(installed.pageIds.length >= 3);
      for (const pageId of installed.pageIds) {
        await adapter.publish(pageId);
      }
    } finally {
      adapter.close();
    }

    adapter = new SqliteCmsAdapter(dbPath);
    const site = await adapter.loadSite('church-site');
    assert.ok(site.pages.length >= 3, 'imported pages must survive reopen');
    assert.ok(Object.keys(site.theme?.cssVars || {}).length > 0, 'theme tokens must survive');

    const runtime = await startLocalCmsRuntime({
      adapter,
      siteId: 'church-site',
      port: 0,
      host: '127.0.0.1',
    });

    try {
      const homeRes = await fetch(`${runtime.origin}/`);
      assert.equal(homeRes.status, 200, 'public / must resolve published home');
      const homeHtml = await homeRes.text();
      assert.ok(/Church|Welcome|Imported|Beliefs|Mission/i.test(homeHtml), 'home HTML should reflect imported content');

      assert.equal((await fetch(`${runtime.origin}/beliefs`)).status, 200, '/beliefs must resolve');
      assert.equal((await fetch(`${runtime.origin}/mission`)).status, 200, '/mission must resolve');

      const cms = await fetch(`${runtime.origin}/cms`);
      assert.equal(cms.status, 200, '/cms must resolve behind auth host');
      assert.ok(/Protected CMS|CMS/i.test(await cms.text()));

      const page = site.pages.find((p) => p.slug === '/beliefs') || site.pages[1];
      const publishedBefore = await adapter.getPublishedRevision(page.id);
      const draftPage = await adapter.getPage(page.id);
      const body = draftPage.sections.find((s) => s.zone === 'BODY') || draftPage.sections[0];
      body.fields = { ...body.fields, headline: 'DRAFT_ONLY_HEADLINE_PROOF' };
      await adapter.saveDraft(page.id, { sections: draftPage.sections });

      const publicPath = page.slug === '/' ? '/' : page.slug;
      const publicDuringDraft = await (await fetch(`${runtime.origin}${publicPath}`)).text();
      assert.equal(
        publicDuringDraft.includes('DRAFT_ONLY_HEADLINE_PROOF'),
        false,
        'public site must stay on previous publication until Publish',
      );

      await adapter.publish(page.id);
      const publicAfter = await (await fetch(`${runtime.origin}${publicPath}`)).text();
      assert.ok(publicAfter.includes('DRAFT_ONLY_HEADLINE_PROOF'), 'public site must update after Publish');
      const publishedAfter = await adapter.getPublishedRevision(page.id);
      assert.notEqual(publishedAfter.publicationId, publishedBefore.publicationId);

      const provenance = JSON.parse(readFileSync(join(packOut, 'provenance.json'), 'utf8'));
      assert.ok(provenance.provenance?.sourceHash);
    } finally {
      await runtime.close();
      adapter.close();
    }

    console.log(
      `verify-cms-theme-import OK · pages=${pack.manifest.pages.length} · zip pages=${zipPack.manifest.pages.length} · draft/publish localhost proof`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('verify-cms-theme-import FAILED');
  console.error(error);
  process.exit(1);
});
