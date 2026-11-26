import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const appPath = new URL('../src/DesignCanvasApp.tsx', import.meta.url);
const modelPath = new URL('../src/creative-model.ts', import.meta.url);

async function loadModel() {
  const result = await build({
    entryPoints: [modelPath.pathname],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const source = result.outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}


test('all five workspace destinations create independent editable document types', async () => {
  const model = await loadModel();
  const types = ['slides', 'design', 'code', 'system', 'whiteboard'];
  const artifacts = types.map(type => model.makeArtifact(type));
  assert.deepEqual(artifacts.map(item => item.type), types);
  assert.deepEqual(artifacts.map(item => item.workspace), types);
  assert.equal(new Set(artifacts.map(item => item.id)).size, 5);
  assert.ok(artifacts.every(item => item.id.startsWith('canvas_')));
  assert.deepEqual(artifacts[1].data.artboards, []);
  assert.equal(artifacts[2].data.files[0].name, 'index.html');
  assert.equal(artifacts[2].data.files[0].content, '');
  assert.deepEqual(artifacts[3].data.colors, []);
  assert.equal(artifacts[4].data.artboards.length, 1);
  assert.equal(artifacts[4].data.artboards[0].objects.length, 0);
});

test('code and whiteboard copies retain workspace identity and re-key document nodes', async () => {
  const model = await loadModel();
  const code = model.makeArtifact('code');
  const codeCopy = model.duplicateArtifact(code);
  assert.equal(codeCopy.type, 'code');
  assert.equal(codeCopy.workspace, 'code');
  assert.notEqual(codeCopy.data.files[0].id, code.data.files[0].id);
  const whiteboard = model.makeArtifact('whiteboard');
  const whiteboardCopy = model.duplicateArtifact(whiteboard);
  assert.equal(whiteboardCopy.type, 'whiteboard');
  assert.notEqual(whiteboardCopy.data.artboards[0].id, whiteboard.data.artboards[0].id);
});

test('gallery exposes six distinct cover assets and functional library filters', async () => {
  const app = await readFile(appPath, 'utf8');
  for (const name of ['slides.svg', 'brand-guidelines.svg', 'design.svg', 'design-in-code.svg', 'design-system.svg', 'whiteboard.svg']) {
    assert.ok(app.includes(name), 'gallery should use the ' + name + ' cover');
  }
  for (const label of ['All', 'Pinned', 'Yours', 'Shared with you', 'Search your work']) {
    assert.ok(app.includes(label), 'gallery should expose ' + label);
  }
  assert.ok(app.includes("setViewMode(viewMode === 'grid' ? 'list' : 'grid')"));
});

test('Create in Code hands off to the existing Work IDE instead of bundling a second editor', async () => {
  const app = await readFile(appPath, 'utf8');
  const host = await readFile(new URL('../../local-studio/frontend/src/components/workbench/creative-workspace-stage.tsx', import.meta.url), 'utf8');
  assert.ok(app.includes('onOpenCode?.()'), 'Create in Code should use the host handoff');
  assert.ok(host.includes('setWorkSurface(\"code\")'), 'the host should open the existing Work Code surface');
  await assert.rejects(readFile(new URL('../src/CodeEditor.tsx', import.meta.url), 'utf8'), { code: 'ENOENT' });
});

test('new Design Systems start with real empty collections', async () => {
  const model = await loadModel();
  const system = model.emptyDesignSystem();
  for (const key of ['colors', 'typography', 'spacing', 'radii', 'shadows', 'components', 'assets', 'files']) {
    assert.deepEqual(system[key], [], key + ' should start empty');
  }
});

test('Brand Guidelines is a complete eight-slide editable template with explicit placeholders', async () => {
  const model = await loadModel();
  const document = model.brandGuidelinesSlides();
  assert.equal(document.slides.length, 8);
  assert.deepEqual(document.slides.map((slide) => slide.name), [
    'Brand Guidelines', 'Brand Foundation', 'Logo System', 'Color System', 'Typography', 'Imagery & Art Direction', 'Voice & Messaging', 'Applications & Governance'
  ]);
  for (const slide of document.slides) {
    assert.ok(slide.objects.length > 0, slide.name + ' should contain editable objects');
    assert.ok(slide.objects.every((object) => object.id && object.type && Number.isFinite(object.x)));
    assert.ok(slide.notes.length > 20, slide.name + ' should include instructions for completing the template');
  }
  const copy = document.slides.flatMap((slide) => slide.objects).map((object) => object.text || '').join('\n');
  for (const fixture of ['Studio name', 'Client name', 'YOUR BRAND', 'Image one', 'Image two', 'Image three']) {
    assert.ok(!copy.includes(fixture), fixture + ' must not be baked into the platform preset');
  }
  for (const prompt of ['Brand name', 'PURPOSE', 'POSITIONING', 'PRIMARY LOCKUP', 'DISPLAY FACE', 'VOICE TRAITS', 'SOURCE FILES']) {
    assert.ok(copy.includes(prompt), 'template should guide the user through ' + prompt);
  }
});

test('blank Design starts without artboards and blank Slides starts with one clean slide', async () => {
  const model = await loadModel();
  assert.deepEqual(model.blankDesign().artboards, []);
  const slides = model.blankSlides();
  assert.equal(slides.slides.length, 1);
  assert.equal(slides.slides[0].objects.length, 0);
});

test('slide preset instances receive independent slide and object identities', async () => {
  const model = await loadModel();
  const first = model.makeSlidePreset('Color Palette');
  const second = model.makeSlidePreset('Color Palette');
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.objects[0].id, second.objects[0].id);
});


test('duplicate artifacts re-key every nested object and clear favorite state', async () => {
  const model = await loadModel();
  const original = model.makeArtifact('slides', 'Working deck', model.brandGuidelinesSlides());
  original.pinned = true;
  const duplicate = model.duplicateArtifact(original);
  assert.notEqual(duplicate.id, original.id);
  assert.equal(duplicate.name, 'Working deck copy');
  assert.equal(duplicate.pinned, false);
  const ids = (value) => {
    if (Array.isArray(value)) return value.flatMap(ids);
    if (!value || typeof value !== 'object') return [];
    return [...('id' in value && typeof value.id === 'string' ? [value.id] : []), ...Object.values(value).flatMap(ids)];
  };
  const originalIds = ids(original.data);
  const duplicateIds = ids(duplicate.data);
  assert.equal(new Set(duplicateIds).size, duplicateIds.length);
  for (const id of originalIds) assert.ok(!duplicateIds.includes(id), 'duplicate must not reuse nested id ' + id);
});

test('image collection is derived from actual document content', async () => {
  const model = await loadModel();
  const blank = model.makeArtifact('slides', 'Blank', model.blankSlides());
  assert.equal(model.artifactHasImages(blank), false);
  blank.data.slides[0].objects.push({ id: 'image-1', type: 'image', name: 'Image', x: 0, y: 0, w: 20, h: 20 });
  assert.equal(model.artifactHasImages(blank), true);
  const system = model.makeArtifact('system');
  assert.equal(model.artifactHasImages(system), false);
  system.data.assets.push({ id: 'asset-1', name: 'Mark', kind: 'image/png', dataUrl: 'data:image/png;base64,AA==', size: 1 });
  assert.equal(model.artifactHasImages(system), true);
});

test('editor chrome exposes implemented actions rather than decorative reference controls', async () => {
  const source = await readFile(appPath, 'utf8');
  const menus = await readFile(new URL('../src/components/EditorMenus.tsx', import.meta.url), 'utf8');
  for (const control of ['DocumentActionsMenu', 'CreationMenu', 'InsertMenu', 'ZoomControls', 'PresentMenu', 'ArtboardMenu']) {
    assert.ok(menus.includes('function ' + control), control + ' should be a reusable production control');
  }
  for (const feature of ['SourcePanel', 'SelectionFormattingToolbar', 'dcx-layer-row', 'snapToGrid', 'presentNotes', 'onShareArtifact', 'onSaveToLibrary']) {
    assert.ok(source.includes(feature), feature + ' should be wired to the application');
  }
  assert.doesNotMatch(source, /EditorTweaks|setInspectorTab/);
  assert.doesNotMatch(source, /Luma Studio|Telescope|fake checkout|Start free, stay for/);
});

test('creative app uses the shared workspace frame and host-owned integration boundary', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /DesignWorkspaceFrame/);
  assert.match(source, /initialArtifacts/);
  assert.match(source, /onArtifactsChange/);
  assert.match(source, /onAskAgentSam/);
  assert.match(source, /SourceLibraryApp/);
  assert.match(source, /function SlideEditor/);
  assert.match(source, /function DesignEditor/);
  assert.match(source, /function DesignSystemEditor/);
  assert.match(source, /No colors yet/);
  assert.match(source, /No type styles yet/);
  assert.match(source, /Start with a blank artboard/);
  assert.doesNotMatch(source, /Chart data \(JSON\)|Table data \(JSON\)/);
  assert.match(source, /onArtifactsChange/);
  assert.doesNotMatch(source, /disabled=\{!onAsk\}/, 'standalone mode must not show dead host-integration controls');
  assert.match(source, /\{onAsk \? <button className=\"dcx-setup-card\"/);
  assert.match(source, /A seven-slide starting deck for your identity/);
  const referenceSource = await readFile(new URL('../src/SourceLibraryApp.tsx', import.meta.url), 'utf8');
  for (const internalLabel of ['Source-backed artboards', 'Source-owned HTML artboards', 'Session-only edits', 'This does not write into the Git checkout']) {
    assert.ok(!referenceSource.includes(internalLabel), internalLabel + ' must not leak into the product UI');
  }
});

test('app manifest declares Slides, Design, and Design System capabilities', async () => {
  const manifest = JSON.parse(await readFile(new URL('../agentsam.app.json', import.meta.url), 'utf8'));
  for (const capability of ['slides', 'design', 'design-systems', 'brand-guidelines', 'native-editable-objects']) {
    assert.ok(manifest.capabilities.includes(capability), capability);
  }
});
