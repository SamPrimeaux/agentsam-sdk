#!/usr/bin/env node
/**
 * Adapter semantic smoke — runs while private:true.
 * Proves CmsEditorAdapter CRUD + draft/preview/publish without UI remaster.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const root = await import(pathToFileURL(join(packageRoot, 'dist/index.js')).href);
  assert.ok(root.CmsEditor || root.default, 'CmsEditor export missing');
  assert.ok(root.MemoryCmsAdapter, 'MemoryCmsAdapter export missing');
  assert.ok(root.installStarterPack, 'installStarterPack export missing');
  assert.ok(root.heuristicStarterPack, 'heuristicStarterPack export missing');
  assert.equal(root.heuristicStarterPack.provenance.kind, 'builtin_starter');
  assert.notEqual(root.heuristicStarterPack.ephemeral, true);

  const adapter = root.MemoryCmsAdapter.empty('smoke-site', 'Smoke Site');
  const installed = await root.installStarterPack(adapter, root.heuristicStarterPack, {
    siteId: 'smoke-site',
  });
  assert.ok(installed.pageIds.length >= 1, 'starter install must create a page');

  const site = await adapter.loadSite('smoke-site');
  assert.ok(site.pages.length >= 1, 'site must retain starter pages after install');
  const pageId = installed.pageIds[0];

  // Page CRUD
  const page = await adapter.getPage(pageId);
  assert.equal(page.id, pageId);
  await adapter.updatePage(pageId, { title: 'Smoke Home' });
  const updated = await adapter.getPage(pageId);
  assert.equal(updated.title, 'Smoke Home');

  const extra = await adapter.createPage('smoke-site', { title: 'Extra', slug: '/extra' });
  await adapter.deletePage(extra.id);
  const afterDelete = await adapter.listPages('smoke-site');
  assert.equal(afterDelete.some((p) => p.id === extra.id), false);

  // Section CRUD
  const section = await adapter.createSection(pageId, { name: 'Smoke Section', type: 'hero' });
  await adapter.updateSection(section.id, { name: 'Smoke Section 2' });
  const sections = await adapter.listSections(pageId);
  assert.ok(sections.some((s) => s.id === section.id && s.name === 'Smoke Section 2'));
  const block = await adapter.createBlock(section.id, {
    type: 'text',
    data: { text: 'hello' },
  });
  await adapter.updateBlock(block.id, { data: { text: 'hello world' } });
  const blocks = await adapter.listBlocks(section.id);
  assert.equal(blocks.find((b) => b.id === block.id)?.data?.text, 'hello world');
  await adapter.deleteBlock(block.id);
  await adapter.deleteSection(section.id);

  // Draft / revision / preview / publish
  const draftPage = await adapter.getPage(pageId);
  draftPage.sections[0].fields = { ...(draftPage.sections[0].fields || {}), smoke: true };
  const revision = await adapter.saveDraft(pageId, { sections: draftPage.sections });
  assert.ok(revision.id);
  const reloaded = await adapter.getPage(pageId);
  assert.equal(reloaded.sections[0].fields.smoke, true);
  const revisions = await adapter.listRevisions(pageId);
  assert.ok(revisions.length >= 1);
  const gotRev = await adapter.getRevision(revision.id);
  assert.equal(gotRev.id, revision.id);
  const preview = await adapter.previewDraft(pageId);
  assert.ok(preview.snapshot);
  const published = await adapter.publish(pageId);
  assert.ok(published.publicationId);
  const pub = await adapter.getPublishedRevision(pageId);
  assert.ok(pub?.publicationId);

  // Assets
  const asset = await adapter.uploadAsset('smoke-site', new Blob(['x'], { type: 'text/plain' }), {
    name: 'note.txt',
  });
  const listed = await adapter.listAssets('smoke-site');
  assert.ok(listed.some((a) => a.id === asset.id));
  await adapter.updateAsset(asset.id, { name: 'note-2.txt' });
  const gotAsset = await adapter.getAsset(asset.id);
  assert.equal(gotAsset.name, 'note-2.txt');
  await adapter.deleteAsset(asset.id);

  // Prove root export does not require AgentSam workbench packages
  assert.equal('AgentSamWorkbench' in root, false);

  console.log(
    `verify-cms-adapter-smoke OK · pack=${root.heuristicStarterPack.id}@v${root.heuristicStarterPack.version} · pages=${site.pages.length} · published=${published.publicationId}`,
  );
}

main().catch((error) => {
  console.error('verify-cms-adapter-smoke FAILED');
  console.error(error);
  process.exit(1);
});
