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


test('all eight workspace destinations create independent editable document types', async () => {
  const model = await loadModel();
  const types = ['page', 'document', 'spreadsheet', 'slides', 'design', 'code', 'system', 'whiteboard'];
  const artifacts = types.map(type => model.makeArtifact(type));
  assert.deepEqual(artifacts.map(item => item.type), types);
  assert.deepEqual(artifacts.map(item => item.workspace), types);
  assert.equal(new Set(artifacts.map(item => item.id)).size, 8);
  assert.ok(artifacts.every(item => item.id.startsWith('canvas_')));
  assert.equal(artifacts[0].data.title, 'Untitled page');
  assert.deepEqual(artifacts[0].data.blocks, []);
  assert.equal(artifacts[1].data.title, 'Untitled document');
  assert.deepEqual(artifacts[1].data.blocks, []);
  assert.equal(artifacts[2].data.sheets.length, 1);
  assert.equal(artifacts[2].data.sheets[0].rows.length, 10);
  assert.equal(artifacts[3].data.slides.length, 1);
  assert.equal(artifacts[4].data.artboards.length, 0);
  assert.equal(artifacts[5].data.files[0].name, 'index.html');
  assert.equal(artifacts[5].data.files[0].content, '');
  assert.deepEqual(artifacts[6].data.colors, []);
  assert.equal(artifacts[7].data.artboards.length, 1);
  assert.equal(artifacts[7].data.artboards[0].objects.length, 0);
});

test('Page, Document and Spreadsheet templates create independent native documents', async () => {
  const model = await loadModel();
  const page = model.makeArtifact('page', 'To-do List', {
    title: 'To-do List',
    subtitle: 'A living list of actions',
    blocks: [{ id: 'task_list_source', type: 'task_list', title: 'To do', items: [{ id: 'task_source', text: 'Example task', checked: false }] }],
  });
  const document = model.makeArtifact('document', 'Project Brief', {
    title: 'Project Brief', subtitle: 'Working brief',
    blocks: [{ id: 'heading_source', type: 'heading', text: 'Overview' }, { id: 'paragraph_source', type: 'paragraph', text: 'Describe the project.' }],
  });
  const spreadsheet = model.makeArtifact('spreadsheet', 'Project Tracker');
  assert.equal(model.isPageDocument(page.data), true);
  assert.equal(model.isTextDocument(document.data), true);
  assert.equal(model.isSpreadsheetDocument(spreadsheet.data), true);
  const pageCopy = model.duplicateArtifact(page);
  const documentCopy = model.duplicateArtifact(document);
  const sheetCopy = model.duplicateArtifact(spreadsheet);
  assert.notEqual(pageCopy.data.blocks[0].id, page.data.blocks[0].id);
  assert.notEqual(pageCopy.data.blocks[0].items[0].id, page.data.blocks[0].items[0].id);
  assert.notEqual(documentCopy.data.blocks[0].id, document.data.blocks[0].id);
  assert.notEqual(sheetCopy.data.sheets[0].id, spreadsheet.data.sheets[0].id);
  assert.notEqual(sheetCopy.data.sheets[0].columns[0].id, spreadsheet.data.sheets[0].columns[0].id);
  assert.equal(model.artifactHasImages(page), false);
  assert.equal(model.artifactHasImages(document), false);
  assert.equal(model.artifactHasImages(spreadsheet), false);
});

test('copying populated spreadsheet templates preserves cell references, formulas and active sheet', async () => {
  const model = await loadModel();
  const source = {
    activeSheetId: 'sheet_2',
    sheets: [
      { id: 'sheet_1', name: 'Overview', columns: [{ id: 'col_label', label: 'Label' }], rows: [{ id: 'row_1', cells: { col_label: 'Summary' } }] },
      { id: 'sheet_2', name: 'Budget', columns: [{ id: 'col_item', label: 'Item' }, { id: 'col_amount', label: 'Amount', type: 'number' }], rows: [
        { id: 'row_2', cells: { col_item: 'Design', col_amount: '1200' } },
        { id: 'row_3', cells: { col_item: 'Total', col_amount: '=SUM(B1:B1)' } },
      ] },
    ],
  };
  const cloned = model.reidentifyCreativeData(source);
  const copy = model.duplicateArtifact(model.makeArtifact('spreadsheet', 'Budget', source)).data;
  for (const result of [cloned, copy]) {
    assert.equal(model.isSpreadsheetDocument(result), true);
    assert.equal(result.activeSheetId, result.sheets[1].id);
    for (const [i, sheet] of result.sheets.entries()) {
      assert.notEqual(sheet.id, source.sheets[i].id);
      assert.deepEqual(sheet.rows.map(row => sheet.columns.map(col => row.cells[col.id])), source.sheets[i].rows.map(row => source.sheets[i].columns.map(col => row.cells[col.id])));
      assert.ok(sheet.columns.every((col, j) => col.id !== source.sheets[i].columns[j].id));
      assert.ok(sheet.rows.every((row, j) => row.id !== source.sheets[i].rows[j].id));
    }
  }
  assert.equal(source.sheets[1].rows[1].cells.col_amount, '=SUM(B1:B1)');
});

test('first Page, Document and Spreadsheet template payloads satisfy their native document contracts', async () => {
  const model = await loadModel();
  const base = new URL('../templates/creative/design-canvas/', import.meta.url);
  const page = JSON.parse(await readFile(new URL('pages/to-do-list/v1/page.json', base), 'utf8'));
  const document = JSON.parse(await readFile(new URL('documents/project-brief/v1/document.json', base), 'utf8'));
  const spreadsheet = JSON.parse(await readFile(new URL('spreadsheets/project-tracker/v1/spreadsheet.json', base), 'utf8'));
  assert.equal(page.type, 'page');
  assert.equal(model.isPageDocument(page.data), true);
  assert.equal(document.type, 'document');
  assert.equal(model.isTextDocument(document.data), true);
  assert.equal(spreadsheet.type, 'spreadsheet');
  assert.equal(model.isSpreadsheetDocument(spreadsheet.data), true);
  assert.ok(page.data.blocks.some(block => block.type === 'task_list'));
  assert.ok(page.data.blocks.some(block => block.type === 'callout' && block.text.includes('Do not invent tasks')));
  assert.ok(document.data.blocks.some(block => block.type === 'heading'));
  assert.equal(spreadsheet.data.sheets[0].columns.length, 6);
  for (const path of [
    '../templates/previews/creative/design-canvas/pages/to-do-list/v1/preview.svg',
    '../templates/previews/creative/design-canvas/documents/project-brief/v1/preview.svg',
    '../templates/previews/creative/design-canvas/spreadsheets/project-tracker/v1/preview.svg',
  ]) {
    const preview = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(preview, /<svg/);
  }
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

test('Design quick-create gallery keeps shared covers and Brand Guidelines remains a catalog preview', async () => {
  const app = await readFile(appPath, 'utf8');
  const browser = await readFile(new URL('../src/components/TemplateBrowserDialog.tsx', import.meta.url), 'utf8');
  const covers = await readFile(new URL('../../../packages/agentsam-workbench/src/widgets/creative-covers.ts', import.meta.url), 'utf8');
  for (const name of ['slides', 'design', 'design-in-code', 'design-system', 'whiteboard']) {
    assert.ok(app.includes("CREATIVE_WIDGET_COVERS['" + name + "']") || app.includes('CREATIVE_WIDGET_COVERS.' + name.replaceAll('-', '')), 'gallery should use the shared ' + name + ' cover');
  }
  assert.ok(!app.includes('createBrandGuidelines'), 'Brand Guidelines must remain catalog-driven, not a hardcoded runtime deck');
  assert.ok(app.includes("template.title.trim().toLowerCase() === 'brand guidelines'"), 'Brand Guidelines receives its shared SVG preview fallback');
  assert.ok(app.includes("setViewMode(viewMode === 'grid' ? 'list' : 'grid')"));
  assert.ok(browser.includes('template.cover') && browser.includes('dcx-template-card-art-cover'), 'the template browser renders the shared cover fallback');
  assert.ok(covers.includes("'brand-guidelines':"), 'Brand Guidelines SVG remains available for template previews');
  for (const label of ['All', 'Pinned', 'Yours', 'Shared with you', 'Search your work']) {
    assert.ok(app.includes(label), 'gallery should expose ' + label);
  }
});

test('gallery keeps shared creation covers and opens the shared template browser', async () => {
  const app = await readFile(appPath, 'utf8');
  const browser = await readFile(new URL('../src/components/TemplateBrowserDialog.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/design-canvas.css', import.meta.url), 'utf8');
  for (const label of ['All', 'Pinned', 'Yours', 'Shared with you', 'Search your work']) assert.ok(app.includes(label), 'gallery should expose ' + label);
  assert.ok(app.includes('dcx-gallery-create'), 'gallery should expose its primary Create action');
  assert.ok(app.includes('<TemplateBrowserDialog'), 'gallery should use the shared template browser');
  assert.ok(app.includes('dcx-create-tile'), 'the existing packaged creation-cover tiles remain available');
  assert.ok(!app.includes('dcx-studio-template-list'), 'the old text-only template list must be removed');
  for (const label of ['For you', 'Pages', 'Documents', 'Slides', 'Sheets', 'Images']) assert.ok(browser.includes(label), 'template browser should expose ' + label);
  assert.ok(css.includes('.dcx-template-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))'), 'template browser should use a three-column visual grid with responsive breakpoints');
  assert.ok(css.includes('.dcx-template-browser-scroll{min-height:0;flex:1;overflow:auto'), 'template grid should scroll independently');
});

test('presentation and image-template uploads use the shared Cloudflare OAuth media path instead of embedding base64', async () => {
  const app = await readFile(appPath, 'utf8');
  const upload = app.slice(app.indexOf('const uploadImageToMedia'), app.indexOf('const uploadPresentationImage'));
  assert.ok(upload.includes("fetch('/api/admin/media?provider=cloudflare'"));
  assert.ok(upload.includes("form.append('files', file)"));
  assert.ok(upload.includes('safeWidgetMediaUrl'));
  assert.doesNotMatch(upload, /FileReader|readAsDataURL/);
  assert.ok(app.includes('pendingImageTemplate'));
  assert.ok(app.includes('Reference image URL: '));
  assert.ok(app.includes('templateReferenceInput.current?.click()'));
});

test('Design Canvas template browser reads studio_templates and applies real stored payloads', async () => {
  const app = await readFile(appPath, 'utf8');
  const browser = await readFile(new URL('../src/components/TemplateBrowserDialog.tsx', import.meta.url), 'utf8');
  assert.ok(app.includes("fetch('/api/work/cad/catalog?app=design-canvas'"));
  for (const kind of ['presentation_template', 'slide_template', 'image_generation_template']) assert.ok(browser.includes(kind));
  assert.ok(app.includes('fetch(template.payloadUrl'));
  assert.ok(browser.includes('Create presentation'));
  assert.ok(browser.includes('Use prompt'));
  assert.ok(app.includes('Prompt: '));
  assert.ok(app.includes('activeIdAtInsert'));
  assert.ok(app.includes("create(makeArtifact('slides', template.title, { slides: cleanSlides }))"));
  assert.ok(!app.includes('brandGuidelinesSlides'), 'Brand Guidelines must not be generated from the old hardcoded runtime deck');
});

test('Code handoff opens a fresh design-aware Work session and preserves repository context', async () => {
  const app = await readFile(appPath, 'utf8');
  const host = await readFile(new URL('../../local-studio/frontend/src/components/workbench/creative-workspace-stage.tsx', import.meta.url), 'utf8');
  assert.ok(app.includes('onOpenCode({ artifactId: artifact.id'), 'the handoff must retain the selected artifact');
  assert.ok(host.includes('const chatId = store.startChat();'), 'the handoff must open a separate Work conversation instead of reusing the canvas parent chat');
  assert.ok(host.includes('store.renameChat(chatId, "New session");'), 'the new conversation must have the expected Work session identity');
  assert.ok(host.includes('navData.onModeChange?.("work");'), 'the handoff must enter Work mode');
  assert.ok(host.includes('item.id === store.activeProjectId && item.kind === "filesystem"'), 'the host must resolve the selected filesystem-backed Work project');
  assert.ok(host.includes('Use the currently selected filesystem-backed AgentSam Work project'), 'an existing repository must be preserved as context');
  assert.ok(host.includes('No filesystem-backed project is currently selected. Ask the user which existing repository to connect before making code changes.'), 'missing repository context must be explicit without inventing a project');
  assert.ok(host.includes('Treat this as a design-aware Code session.'), 'the shared composer must receive the Design Canvas handoff intent');
  assert.ok(host.includes('Do not ingest, clone, or summarize the entire repository.'), 'the handoff must request selective repository discovery');
  assert.ok(host.includes('tag: "design-code-handoff"'), 'the handoff must attach context to the shared AgentSam composer');
  assert.ok(host.includes('store.setPendingAnnotations(chatId, items =>'), 'the design context must be attached to the new conversation');
  assert.ok(host.includes('store.setWorkSurface("chat")'), 'the handoff must keep the user in the shared AgentSam composer');
  assert.ok(!host.includes('onOpenCode={() => useWorkStore.getState().setWorkSurface("code")}'), 'the canvas must not switch to a disconnected Code surface');
});

test('document sharing and Save to Library use truthful host actions', async () => {
  const host = await readFile(new URL('../../local-studio/frontend/src/components/workbench/creative-workspace-stage.tsx', import.meta.url), 'utf8');
  assert.ok(host.includes('onShareArtifact={(artifact) => { void shareWorkspaceLink(artifact); }}'));
  assert.ok(host.includes('navigator.share({ title: artifact.name'));
  assert.ok(host.includes('Recipients need access to this AgentSam workspace.'));
  const app = await readFile(appPath, 'utf8');
  assert.ok(app.includes('onPermissions={onManagePermissions ? () => onManagePermissions(active) : undefined}'));
  assert.ok(!app.includes('onPermissions={onManagePermissions ? () => onManagePermissions(active) : onShareArtifact'));
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

test('Brand Guidelines is catalog-driven and is not bundled as a hardcoded runtime deck', async () => {
  const modelSource = await readFile(new URL('../src/creative-model.ts', import.meta.url), 'utf8');
  const app = await readFile(appPath, 'utf8');
  assert.doesNotMatch(modelSource, /brandGuidelinesSlides|Brand Foundations|Applications & Governance/);
  assert.ok(app.includes("fetch('/api/work/cad/catalog?app=design-canvas'"));
  assert.ok(app.includes('fetch(template.payloadUrl'));
});

test('new Slides starts with an editable title layout rather than a dead white canvas', async () => {
  const model = await loadModel();
  assert.deepEqual(model.blankDesign().artboards, []);
  const slides = model.blankSlides();
  assert.equal(slides.slides.length, 1);
  assert.ok(slides.slides[0].objects.length >= 2, 'title and subtitle placeholders should be editable objects');
  assert.ok(slides.slides[0].objects.filter((item) => item.type === 'text').length >= 2, 'title and subtitle placeholders should be text objects');
});

test('slide preset instances receive independent slide and object identities', async () => {
  const model = await loadModel();
  const first = model.makeSlidePreset('Title');
  const second = model.makeSlidePreset('Title');
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.objects[0].id, second.objects[0].id);
});


test('duplicate artifacts re-key every nested object and clear favorite state', async () => {
  const model = await loadModel();
  const testDeck = model.blankSlides();
  testDeck.slides.push(model.makeSlidePreset('Two columns'));
  const original = model.makeArtifact('slides', 'Working deck', testDeck);
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

test('document menu only exposes host actions with real adapters and reports the actual storage source', async () => {
  const app = await readFile(appPath, 'utf8');
  const menus = await readFile(new URL('../src/components/EditorMenus.tsx', import.meta.url), 'utf8');
  for (const action of ['onShare', 'onHandoff', 'onMoveTo', 'onRefresh', 'onStorage', 'onPermissions', 'onFeedback']) {
    assert.ok(menus.includes('{' + action + ' ? <MenuAction'), action + ' should only render when its host adapter exists');
  }
  assert.ok(menus.includes('{onSaveToLibrary ? <><MenuDivider/><MenuAction'), 'Save to Library should only render when its host adapter exists');
  assert.ok(app.includes('onRefresh={onArtifactsChange ? (onRefreshArtifact ? refreshActive : undefined) : refreshActive}'), 'host-managed documents must not use the browser-local refresh path');
  assert.ok(app.includes('This document is stored in your AgentSam Creative Workspace and synchronized through the host artifact service.'), 'host storage details must describe the canonical artifact service');
  assert.ok(app.includes('This document is stored in this browser’s local Design Canvas workspace.'), 'standalone storage details must describe browser-local drafts');
  assert.ok(app.includes('value="AgentSam Creative Workspace"'), 'host storage must not expose the standalone localStorage key');
  assert.doesNotMatch(menus, /disabled=\{!on(?:Share|Handoff|MoveTo|Refresh|Storage|Permissions|Feedback)\}/, 'unavailable host actions must not render as dead disabled controls');
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
  assert.match(source, /if \(onOpenCode\) onOpenCode\(\);/);
  assert.match(source, /Code workspaces run in AgentSam Work/);
  assert.match(source, /onOpenCode \? <button/);
  assert.match(source, /Open Design Canvas inside Work to continue this saved code workspace/);
  assert.match(source, /if \(!embedded\)/, 'standalone preview must not call host-only APIs');
  const templateBrowser = await readFile(new URL('../src/components/TemplateBrowserDialog.tsx', import.meta.url), 'utf8');
  assert.match(templateBrowser, /Open Design Canvas in AgentSam Work/);
  assert.doesNotMatch(source, /An eight-slide starting deck for your identity/);
  assert.doesNotMatch(source, /brandGuidelinesSlides/);
  assert.doesNotMatch(source, /disabled=\{!onAsk\}/, 'standalone mode must not show dead host-integration controls');
  assert.match(source, /\{onAsk \? <button className=\"dcx-setup-card\"/);
  const referenceSource = await readFile(new URL('../src/SourceLibraryApp.tsx', import.meta.url), 'utf8');
  for (const internalLabel of ['Source-backed artboards', 'Source-owned HTML artboards', 'Session-only edits', 'This does not write into the Git checkout']) {
    assert.ok(!referenceSource.includes(internalLabel), internalLabel + ' must not leak into the product UI');
  }
});

test('app manifest declares implemented creative capabilities without claiming a bundled code IDE', async () => {
  const manifest = JSON.parse(await readFile(new URL('../agentsam.app.json', import.meta.url), 'utf8'));
  for (const capability of ['slides', 'design', 'design-systems', 'brand-guidelines', 'native-editable-objects', 'whiteboard', 'code-workspace']) {
    assert.ok(manifest.capabilities.includes(capability), capability);
  }
  for (const capability of ['code-import', 'code-export', 'sandboxed-code-preview']) {
    assert.ok(!manifest.capabilities.includes(capability), capability + ' is not implemented by the Design Canvas package');
  }
  assert.ok(!manifest.provides.includes('code.editor'), 'code editing is provided by AgentSam Work, not bundled inside Design Canvas');
  assert.match(manifest.description, /handoff to AgentSam Work/);
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
  const document = { slides: ['Title', 'Section', 'Title + body', 'Bullets'].map((kind) => model.makeSlidePreset(kind)) };
  const originalIds = document.slides.map((item) => item.id);
  const reordered = model.reorderSlides(document.slides, originalIds[0], originalIds[3]);
  assert.deepEqual(reordered.map((item) => item.id), [originalIds[1], originalIds[2], originalIds[3], originalIds[0]]);
  assert.equal(reordered[3].objects[0].id, document.slides[0].objects[0].id);
  assert.equal(model.reorderSlides(document.slides, 'missing', originalIds[0]), document.slides);
});

test('slide layout picker uses a fixed portal side panel outside the scrolling slide rail', async () => {
  const menus = await readFile(new URL('../src/components/EditorMenus.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/design-canvas.css', import.meta.url), 'utf8');
  assert.ok(menus.includes('createPortal('));
  assert.ok(menus.includes('dcx-slide-layout-panel'));
  assert.ok(menus.includes('dcx-slide-layout-grid'));
  assert.ok(css.includes('.dcx-slide-layout-panel{position:fixed'));
  assert.ok(css.includes('.dcx-slide-layout-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'));
});

test('editor dropdowns portal above clipped toolbars while staying inside the embedded workspace', async () => {
  const menus = await readFile(new URL('../src/components/EditorMenus.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/design-canvas.css', import.meta.url), 'utf8');
  assert.match(menus, /useLayoutEffect/);
  assert.match(menus, /createPortal\(popover, document\.body\)/);
  assert.match(menus, /closest\('\.dcx-root'\)/);
  assert.match(menus, /'--dcx-menu-left'/);
  assert.match(menus, /menuRef\.current\?\.contains\(target\)/);
  assert.match(css, /\.dcx-root\{[^}]*position:relative;isolation:isolate/);
  assert.match(css, /\.dcx-menu-popover\{position:fixed;left:var\(--dcx-menu-left,0px\);top:var\(--dcx-menu-top,0px\);right:auto;bottom:auto;z-index:1200/);
  assert.match(css, /\.dcx-library-nav-backdrop\{position:absolute;z-index:80/);
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


test('gallery artifact cards render native content previews and keep a three-column desktop, two-column mobile grid', async () => {
  const source = await readFile(appPath, 'utf8');
  const css = await readFile(new URL('../src/design-canvas.css', import.meta.url), 'utf8');
  assert.match(source, /function ArtifactPreviewSurface/);
  assert.match(source, /function ArtifactPreview\(/);
  assert.match(source, /dcx-artifact-preview-slides/);
  assert.match(source, /dcx-spreadsheet-preview/);
  assert.match(source, /dcx-structured-preview-paper/);
  assert.match(source, /<ArtifactPreview artifact=\{artifact\}\/>/);
  assert.match(css, /\.dcx-artifact-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.dcx-artifact-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:10px\}/);
});
