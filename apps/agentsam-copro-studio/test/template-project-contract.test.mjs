import {CoProEditorSession} from "../../../packages/copro-editor/src/index.js";
/**
 * Template lifecycle contract for MovieMode:
 * Discover → Select → Instantiate → Persist → Open → Edit → Reload → Preview
 * Authority: CREATIVE_TEMPLATES / createCreativeProject — no UI-owned parallel registry.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCreativeProject,
  CREATIVE_TEMPLATES,
  listProjectTemplates,
  renderCreativeProjectFrame,
} from '@inneranimalmedia/copro-templates/creative';
import { validateCoProProject } from '@inneranimalmedia/copro-project';
import { MemoryProjectStore } from '@inneranimalmedia/copro-storage';

test('listProjectTemplates discovers from CREATIVE_TEMPLATES — featured is catalog-owned', () => {
  const all = listProjectTemplates();
  const featured = listProjectTemplates({ featuredOnly: true });
  assert.equal(all.length, CREATIVE_TEMPLATES.length);
  assert.ok(featured.length >= 1);
  for (const summary of featured) {
    const authority = CREATIVE_TEMPLATES.find((template) => template.id === summary.id);
    assert.ok(authority, summary.id);
    assert.equal(authority.metadata.creative.featured, true);
    assert.equal(summary.resourceKind, 'project_template');
    assert.equal(summary.name, authority.name);
  }
  assert.ok(featured.some((item) => item.id === 'creative:documentary-opener'));
  assert.ok(featured.some((item) => item.id === 'creative:product-launch'));
  assert.ok(featured.some((item) => item.id === 'creative:social-story'));
});

test('documentary opener creates a distinct project with template provenance', () => {
  const first = createCreativeProject('creative:documentary-opener', {
    projectId: 'project:from-template:documentary-opener:1',
    now: '2026-11-01T12:00:00.000Z',
  });
  const second = createCreativeProject('creative:documentary-opener', {
    projectId: 'project:from-template:documentary-opener:2',
    now: '2026-11-01T12:00:01.000Z',
  });

  assert.notEqual(first.id, second.id);
  assert.equal(validateCoProProject(first).ok, true);
  assert.equal(validateCoProProject(second).ok, true);
  assert.equal(first.metadata.provenance.kind, 'project_template');
  assert.equal(first.metadata.provenance.templateId, 'creative:documentary-opener');
  assert.equal(first.metadata.templateId, 'creative:documentary-opener');
  assert.ok(first.tracks.some((track) => track.clips.some((clip) => clip.metadata?.creative)));
});

test('every packaged creative template instantiates without sharing identity', () => {
  const ids = new Set();
  for (const template of CREATIVE_TEMPLATES) {
    const project = createCreativeProject(template.id, {
      projectId: `project:from-template:${template.metadata.creative.scene}:${ids.size}`,
      now: '2026-11-01T12:00:00.000Z',
    });
    assert.equal(validateCoProProject(project).ok, true, template.id);
    assert.equal(ids.has(project.id), false);
    ids.add(project.id);
    assert.equal(project.metadata.provenance.templateId, template.id);
  }
  assert.equal(ids.size, CREATIVE_TEMPLATES.length);
});

test('instantiate → persist → reload reconstructs the same composition', async () => {
  const store = new MemoryProjectStore();
  const created = createCreativeProject('creative:product-launch', {
    projectId: 'project:from-template:product-launch:persist',
    slotValues: { title: 'Persistence proof' },
    now: '2026-11-01T12:00:00.000Z',
  });
  const previewBefore = renderCreativeProjectFrame(created, 1_200_000);
  assert.match(previewBefore, /^<svg/);

  await store.save(created);
  const reloaded = await store.load(created.id);
  assert.ok(reloaded);
  assert.equal(reloaded.id, created.id);
  assert.equal(reloaded.metadata.provenance.templateId, 'creative:product-launch');
  assert.equal(reloaded.title, created.title);
  assert.equal(reloaded.tracks.length, created.tracks.length);

  const creativeClip = reloaded.tracks.flatMap((track) => track.clips)
    .find((clip) => clip.metadata?.creative);
  assert.equal(creativeClip.metadata.creative.parameters.title, 'Persistence proof');

  const previewAfter = renderCreativeProjectFrame(reloaded, 1_200_000);
  assert.equal(previewAfter, previewBefore);

  const other = createCreativeProject('creative:social-story', {
    projectId: 'project:from-template:social-story:other',
    now: '2026-11-01T12:00:01.000Z',
  });
  await store.save(other);
  const stillOriginal = await store.load(created.id);
  assert.equal(stillOriginal.id, created.id);
  assert.notEqual(stillOriginal.id, other.id);
  assert.equal(
    stillOriginal.metadata.provenance.templateId,
    'creative:product-launch',
    'selecting another template must not overwrite a persisted project',
  );
});

test('createCreativeProject refuses missing projectId (no silent identity reuse)', () => {
  assert.throws(
    () => createCreativeProject('creative:documentary-opener', { now: '2026-11-01T12:00:00.000Z' }),
    /copro_template_project_id_required/,
  );
});

test("current-project template application composes layers and preserves project isolation",async()=>{
 const store=new MemoryProjectStore();
 const a=createCreativeProject("creative:film-title",{projectId:"acceptance:A"});
 const b=createCreativeProject("creative:chapter-divider",{projectId:"acceptance:B"});
 await store.save(a);await store.save(b);
 const session=new CoProEditorSession(a);
 const layer=structuredClone(b.tracks[0]);layer.id="applied:"+layer.id;
 layer.clips=layer.clips.map(clip=>({...clip,id:"applied:"+clip.id}));
 const applied=session.execute({type:"project.apply_template",payload:{tracks:[layer]}});
 const svg=renderCreativeProjectFrame(applied,1200000);
 assert.match(svg,/<svg/);
 assert.match(svg,/composition-1-/);
 await store.save(applied);
 assert.deepEqual(await store.load(b.id),b);
 assert.deepEqual(session.undo(),a);
 assert.deepEqual(session.redo(),applied);
 assert.deepEqual(await store.load(a.id),applied);
});
