import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANNOTATION_EXCLUDED_SELECTOR,
  ANNOTATION_TARGET_SELECTOR,
  annotationTargetId,
  describeAnnotationTarget,
  isAnnotationVisualTarget,
  resolveAnnotationTarget,
  resolveAnnotationScope,
  buildAnnotationBridgeScript,
} from '../dist/agent/annotation-selection.js';

class FakeElement {
  constructor(tagName, attributes = {}, textContent = '') {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map(Object.entries(attributes));
    this.parentElement = null;
    this.children = [];
    this.textContent = textContent;
    this.value = '';
    this.isConnected = true;
    this.visible = true;
    this.computedStyle = { display: 'block', visibility: 'visible', opacity: '1' };
    this.ownerDocument = { defaultView: { getComputedStyle: element => element.computedStyle } };
  }
  get id() { return this.getAttribute('id') || ''; }
  get dataset() {
    const result = {};
    for (const [name, value] of this.attributes) {
      if (!name.startsWith('data-')) continue;
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      result[key] = value;
    }
    return result;
  }
  append(child) { child.parentElement = this; this.children.push(child); return child; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  getClientRects() { return this.visible ? [{}] : []; }
  matches(selector) { return selector.split(',').some(part => this.matchesOne(part.trim())); }
  matchesOne(selector) {
    const not = selector.match(/:not\((.+)\)$/);
    if (not) {
      const base = selector.slice(0, not.index);
      return this.matchesOne(base) && !this.matchesOne(not[1]);
    }
    const tagAndAttr = selector.match(/^([a-z][a-z0-9-]*)(\[.+\])?$/i);
    if (tagAndAttr) {
      if (this.tagName.toLowerCase() !== tagAndAttr[1].toLowerCase()) return false;
      return !tagAndAttr[2] || this.matchesOne(tagAndAttr[2]);
    }
    const attr = selector.match(/^\[([^\]=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/);
    if (attr) {
      const [, name, doubleQuoted, singleQuoted, bare] = attr;
      if (!this.hasAttribute(name)) return false;
      const expected = doubleQuoted ?? singleQuoted ?? bare;
      return expected === undefined || this.getAttribute(name) === expected;
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
}

function tree() {
  const root = new FakeElement('main');
  const wrapper = root.append(new FakeElement('div'));
  return { root, wrapper };
}

test('selection resolves the smallest meaningful semantic target and rejects arbitrary wrappers', () => {
  const { root, wrapper } = tree();
  const paragraph = wrapper.append(new FakeElement('p', {}, 'A specific paragraph'));
  const span = paragraph.append(new FakeElement('span', {}, 'specific'));
  assert.equal(resolveAnnotationTarget(span, root), paragraph);
  assert.equal(resolveAnnotationTarget(wrapper, root), null);
  assert.equal(resolveAnnotationTarget(root, root), null);
});

test('nested native controls win over cards, while explicit cards own generic children', () => {
  const { root, wrapper } = tree();
  const card = wrapper.append(new FakeElement('article', { 'data-annotation-target': 'product-card', 'data-annotation-id': 'card-42' }));
  const content = card.append(new FakeElement('div'));
  const button = content.append(new FakeElement('button', {}, 'Open product'));
  assert.equal(resolveAnnotationTarget(content, root), card);
  assert.equal(resolveAnnotationTarget(button, root), button);
  assert.equal(annotationTargetId(card, root), 'card-42');
  const typedOnly = wrapper.append(new FakeElement('div', { 'data-annotation-target': 'card' }));
  assert.match(annotationTargetId(typedOnly, root), /^dom:/);
});

test('rendered child controls can proxy selection to their owning canvas object', () => {
  const { root, wrapper } = tree();
  const node = wrapper.append(new FakeElement('div', { 'data-annotation-target': '', 'data-agentsam-resource': 'node-9' }));
  const renderedButton = node.append(new FakeElement('button', { 'data-annotation-proxy': '' }, 'Preview button'));
  assert.equal(resolveAnnotationTarget(renderedButton, root), node);
  assert.equal(annotationTargetId(node, root), 'node-9');
});

test('annotation controls, assistant UI, hidden and inaccessible content are never selectable', () => {
  const { root, wrapper } = tree();
  const card = wrapper.append(new FakeElement('div', { 'data-annotation-target': 'card' }));
  const toolbar = card.append(new FakeElement('div', { 'data-annotation-control': '' }));
  const button = toolbar.append(new FakeElement('button'));
  const mini = card.append(new FakeElement('div', { 'data-mini-agentsam': '' }));
  const miniButton = mini.append(new FakeElement('button'));
  const hidden = card.append(new FakeElement('p', { 'aria-hidden': 'true' }));
  const collapsed = card.append(new FakeElement('p'));
  collapsed.computedStyle.opacity = '0';
  const notRendered = card.append(new FakeElement('p'));
  notRendered.visible = false;
  assert.equal(resolveAnnotationTarget(button, root), null);
  assert.equal(resolveAnnotationTarget(miniButton, root), null);
  assert.equal(resolveAnnotationTarget(hidden, root), null);
  assert.equal(resolveAnnotationTarget(collapsed, root), null);
  assert.equal(resolveAnnotationTarget(notRendered, root), null);
  assert.ok(ANNOTATION_EXCLUDED_SELECTOR.includes('data-annotation-control'));
});

test('scope boundaries are strict and do not fall back to an outer document', () => {
  const { root } = tree();
  const outside = new FakeElement('button');
  assert.equal(resolveAnnotationTarget(outside, root), null);
  assert.equal(resolveAnnotationTarget(root, root), null);
});

test('form values are withheld while field identity remains useful', () => {
  const { root, wrapper } = tree();
  const input = wrapper.append(new FakeElement('input', { 'aria-label': 'Email address', type: 'password' }));
  input.value = 'private-value-must-never-escape';
  const selected = resolveAnnotationTarget(input, root);
  const description = describeAnnotationTarget(selected, root);
  assert.equal(description.label, 'Email address');
  assert.equal(description.text, '[field value withheld]');
  assert.equal(description.editable, true);
  assert.equal(JSON.stringify(description).includes(input.value), false);
});

test('visual anchors are limited to actual viewports and graphics, not every custom target', () => {
  const { root, wrapper } = tree();
  const card = wrapper.append(new FakeElement('div', { 'data-annotation-target': 'card' }));
  const cadViewport = wrapper.append(new FakeElement('div', { 'data-cad-iframe-region': '' }));
  const svg = wrapper.append(new FakeElement('svg'));
  assert.equal(isAnnotationVisualTarget(card, root), false);
  assert.equal(isAnnotationVisualTarget(cadViewport, root), true);
  assert.equal(isAnnotationVisualTarget(svg, root), true);
});



test('scope resolution honors explicit IDs and focus, and fails closed when ambiguous', () => {
  const canvas = new FakeElement('div', {
    'data-agentsam-annotation-scope': '',
    'data-annotation-scope-id': 'design-canvas',
    'data-annotation-scope-active': 'true',
  });
  const sideStage = new FakeElement('div', {
    'data-agentsam-annotation-scope': '',
    'data-annotation-scope-id': 'side-stage',
  });
  const focusedChild = sideStage.append(new FakeElement('p'));
  const documentRef = { querySelectorAll: () => [canvas, sideStage], activeElement: focusedChild };
  assert.equal(resolveAnnotationScope(documentRef, 'side-stage'), sideStage);
  assert.equal(resolveAnnotationScope(documentRef), sideStage);

  const duplicateA = new FakeElement('div', { 'data-agentsam-annotation-scope': '', 'data-annotation-scope-id': 'files-stage' });
  const duplicateB = new FakeElement('div', { 'data-agentsam-annotation-scope': '', 'data-annotation-scope-id': 'files-stage' });
  const duplicateFocus = duplicateB.append(new FakeElement('button'));
  const duplicateDocument = { querySelectorAll: () => [duplicateA, duplicateB], activeElement: duplicateFocus };
  assert.equal(resolveAnnotationScope(duplicateDocument, 'files-stage'), duplicateB);
  assert.equal(resolveAnnotationScope({ querySelectorAll: () => [duplicateA, duplicateB], activeElement: null }, 'files-stage'), null);
});

test('opaque-origin bridge is generated from the same target and exclusion selectors', () => {
  const script = buildAnnotationBridgeScript();
  assert.ok(script.includes(JSON.stringify(ANNOTATION_TARGET_SELECTOR)));
  assert.ok(script.includes(JSON.stringify(ANNOTATION_EXCLUDED_SELECTOR)));
  assert.doesNotMatch(script, /closest\([^)]*\)\s*\|\|\s*element/);
  assert.doesNotThrow(() => new Function(script));
});
