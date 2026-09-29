#!/usr/bin/env node
/**
 * SQLite durability smoke — real temp file, new adapter instance after each close.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const workDir = mkdtempSync(join(tmpdir(), 'cms-sqlite-smoke-'));
const dbPath = join(workDir, 'cms.sqlite');

async function loadModules() {
  const root = await import(pathToFileURL(join(packageRoot, 'dist/index.js')).href);
  const sqliteMod = await import(pathToFileURL(join(packageRoot, 'dist/sqlite-adapter.js')).href);
  return { root, SqliteCmsAdapter: sqliteMod.SqliteCmsAdapter };
}

async function main() {
  const { root, SqliteCmsAdapter } = await loadModules();
  assert.ok(SqliteCmsAdapter, 'SqliteCmsAdapter export missing');

  let adapter = new SqliteCmsAdapter(dbPath);
  try {
    assert.equal((await adapter.listSites()).length, 0, 'fresh sqlite file must have no sites');
    const installed = await root.installStarterPack(adapter, root.heuristicStarterPack, {
      siteId: 'heuristic',
    });
    assert.ok(installed.pageIds.length >= 1);
    const pageId = installed.pageIds[0];
    const draftPage = await adapter.getPage(pageId);
    draftPage.sections[0].fields = { ...(draftPage.sections[0].fields || {}), sqliteSmoke: true };
    await adapter.saveDraft(pageId, { sections: draftPage.sections });
    const asset = await adapter.uploadAsset('heuristic', new Blob(['sqlite'], { type: 'text/plain' }), {
      name: 'proof.txt',
    });
    assert.ok(asset.id);
  } finally {
    adapter.close();
  }

  adapter = new SqliteCmsAdapter(dbPath);
  try {
    const site = await adapter.loadSite('heuristic');
    assert.ok(site.pages.length >= 1, 'Heuristic pages must survive reopen');
    assert.ok(site.theme?.cssVars?.['--brand-primary'], 'theme must survive reopen');
    assert.equal(site.schemas?.protocol_version, 1, 'schemas must survive reopen');
    const pageId = site.pages[0].id;
    assert.equal(site.pages[0].sections[0].fields?.sqliteSmoke, true, 'draft edit must survive reopen');

    const preview = await adapter.previewDraft(pageId);
    assert.ok(preview.snapshot);
    const pubBefore = await adapter.getPublishedRevision(pageId);
    assert.equal(pubBefore, null, 'published revision unchanged until publish');

    const published = await adapter.publish(pageId);
    assert.ok(published.publicationId);
  } finally {
    adapter.close();
  }

  adapter = new SqliteCmsAdapter(dbPath);
  try {
    const pageId = (await adapter.listPages('heuristic'))[0].id;
    const pub = await adapter.getPublishedRevision(pageId);
    assert.ok(pub?.publicationId, 'publication must survive reopen');
    const revisions = await adapter.listRevisions(pageId);
    const draftRev = revisions.filter((r) => r.kind === 'draft').at(-1);
    assert.ok(draftRev?.id, 'need a draft revision to restore');
    await adapter.restoreRevision(pageId, draftRev.id);
    const assets = await adapter.listAssets('heuristic');
    assert.ok(assets.some((a) => a.name === 'proof.txt'), 'assets must survive reopen');
  } finally {
    adapter.close();
  }

  adapter = new SqliteCmsAdapter(dbPath);
  try {
    const pageId = (await adapter.listPages('heuristic'))[0].id;
    const page = await adapter.getPage(pageId);
    assert.equal(page.sections[0].fields?.sqliteSmoke, true, 'restored draft must survive reopen');
  } finally {
    adapter.close();
  }

  rmSync(workDir, { recursive: true, force: true });
  console.log(`verify-cms-sqlite-smoke OK · db=${dbPath}`);
}

main().catch((error) => {
  console.error('verify-cms-sqlite-smoke FAILED');
  console.error(error);
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
