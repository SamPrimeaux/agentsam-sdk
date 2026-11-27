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
  for (const name of ['slides', 'brand-guidelines', 'design', 'design-in-code', 'design-system', 'whiteboard']) {
    assert.ok(app.includes("CREATIVE_WIDGET_COVERS['" + name + "']") || app.includes('CREATIVE_WIDGET_COVERS.' + name.replaceAll('-', '')), 'gallery should use the shared ' + name + ' cover');
  }
  for (const label of ['All', 'Pinned', 'Yours', 'Shared with you', 'Search your work']) {
    assert.ok(app.includes(label), 'gallery should expose ' + label);
  }
  assert.ok(app.includes("setViewMode(viewMode === 'grid' ? 'list' : 'grid')"));
});

test('Design gallery reads the shared studio_templates catalog and opens stored payloads', async () => {
  const app = await readFile(appPath, 'utf8');
  assert.ok(app.includes("fetch('/api/work/cad/catalog?app=design-canvas'"));
  for (const kind of ['presentation_template', 'slide_template', 'image_generation_template']) assert.ok(app.includes(kind));
  assert.ok(app.includes('fetch(template.payloadUrl'));
  assert.ok(app.includes('Create editable slides'));
  assert.ok(app.includes('Prompt: '));
  assert.ok(app.includes('Add to current presentation'));
  assert.ok(app.includes("create(makeArtifact('slides', template.title, { slides: cleanSlides }))"));
});

test('Code handoff keeps AgentSam in the selected repository and carries the artifact into the lead composer', async () => {
  const app = await readFile(appPath, 'utf8');
  const host = await readFile(new URL('../../local-studio/frontend/src/components/workbench/creative-workspace-stage.tsx', import.meta.url), 'utf8');
  assert.ok(app.includes('onOpenCode?.({ artifactId: artifact.id'), 'the handoff must retain the selected artifact');
  assert.ok(host.includes('item.id === store.activeProjectId && item.kind === "filesystem"'), 'the host must resolve the existing filesystem-backed Work project');
  assert.ok(host.includes('tag: "design-code-handoff"'), 'the handoff must attach context to the shared AgentSam composer');
  assert.ok(host.includes('store.setWorkSurface("chat")'), 'the handoff must keep the user in the AgentSam composer');
  assert.ok(!host.includes('onOpenCode={() => useWorkStore.getState().setWorkSurface("code")}'), 'the canvas must not switch to a disconnected Code surface');
  assert.ok(host.includes('Ask the user to open an existing repository before making code changes.'), 'missing repository context must be explicit');
});

test('document sharing and Save to Library use truthful host actions', async () => {
  const host = await readFile(new URL('../../local-studio/frontend/src/components/workbench/creative-workspace-stage.tsx', import.meta.url), 'utf8');
  assert.ok(host.includes('onShareArtifact={(artifact) => { void shareWorkspaceLink(artifact); }}'));
  assert.ok(host.includes('navigator.share({ title: artifact.name'));
  assert.ok(host.includes('Recipients need access to this AgentSam workspace.'));
  assert.ok(host.includes('onSaveToLibrary={(artifact) => { void saveArtifactToLibrary(artifact); }}'));
  assert.ok(host.includes('JSON.stringify({ starred: true })'));
  assert.ok(host.includes('Added to Library.'));
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

test('Slides provides native editable layout starters instead of reusing Brand Guidelines sections', async () => {
  const model = await loadModel();
  const expected = new Map([
    ['Blank', 0], ['Title', 2], ['Section', 3], ['Title + body', 3],
    ['Bullets', 5], ['Two columns', 6], ['Summary', 10],
  ]);
  for (const [name, minimumObjects] of expected) {
    const value = model.makeSlidePreset(name);
    assert.equal(value.name, name === 'Blank' ? 'Blank slide' : name);
    assert.ok(value.objects.length >= minimumObjects, name + ' should contain editable layout objects');
    assert.equal(new Set(value.objects.map((item) => item.id)).size, value.objects.length, name + ' object IDs should be unique');
  }
});

test('slide reordering moves a slide without dropping or re-keying document content', async () => {
  const model = await loadModel();
  const document = model.brandGuidelinesSlides();
  const originalIds = document.slides.map((item) => item.id);
  const reordered = model.reorderSlides(document.slides, originalIds[0], originalIds[3]);
  assert.deepEqual(reordered.map((item) => item.id), [originalIds[1], originalIds[2], originalIds[3], originalIds[0], ...originalIds.slice(4)]);
  assert.equal(reordered[3].objects[0].id, document.slides[0].objects[0].id);
  assert.equal(model.reorderSlides(document.slides, 'missing', originalIds[0]), document.slides);
});

test('Slides editor exposes reference-led layout, view, and bottom insert controls', async () => {
  const source = await readFile(appPath, 'utf8');
  const menus = await readFile(new URL('../src/components/EditorMenus.tsx', import.meta.url), 'utf8');
  for (const layout of ['Blank', 'Title', 'Section', 'Title + body', 'Bullets', 'Two columns', 'Summary']) {
    assert.ok(menus.includes("['" + layout + "'") || menus.includes("'" + layout + "'"), layout + ' layout should be selectable');
  }
  for (const control of ['SlideLayoutMenu', 'ViewMenu', 'SlideInsertToolbar', 'onDragStart', 'onDrop']) {
    assert.ok(source.includes(control), control + ' should be wired into Slides');
  }
  for (const control of ['Select', 'Hand', 'Text', 'Image', 'Media', 'Table', 'Shape', 'Chart', 'Comment', 'Ask AgentSam']) {
    assert.ok(menus.includes("'" + control + "'") || menus.includes('>' + control + '<') || menus.includes('>' + control), control + ' should be available in the slide insert toolbar');
  }
});
