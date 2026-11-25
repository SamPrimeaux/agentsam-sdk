import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync(
  new URL('../frontend/static/js/theme-editor.js', import.meta.url),
  'utf8',
);

test('style settings render Surface regardless of case and preserve advanced groups', () => {
  const start = editor.indexOf('  function renderInspectorGroups(section)');
  const end = editor.indexOf('  function validateSectionCss', start);
  assert.ok(start >= 0 && end > start);
  const source = editor.slice(start, end);
  const render = new Function('currentSchema','currentSettings','currentSectionSchema','currentBlockSchema','fieldByKey','fieldKind','humanize','renderField','cmsEscapeHtml','cmsEscapeAttr','cmsGetPath','activeBlockId','activeFieldKey', source + '\nreturn renderInspectorGroups;')(
    () => [], () => [{key:'surfaceColor',group:'Surface'},{key:'space',group:'spacing'},{key:'motion',group:'motion'}],
    () => ({}), () => null, () => null, () => 'content', String, (_, field) => field.key, String, String, () => undefined, null, null
  );
  const html = render({content:{}});
  assert.match(html, /aria-label="Surface"/);
  assert.match(html, /surfaceColor/);
  assert.ok(html.indexOf('space') < html.indexOf('surfaceColor'));
  assert.match(html, /<summary>motion<\/summary>/);
});

test('inspector subtitle shows human labels, not raw keys', () => {
  assert.ok(
    !editor.includes("sectionLabel + ' · ' + blockMeta.id"),
    'block subtitle should not expose the raw block id',
  );
  assert.ok(
    !editor.includes(") + ' · ' + section.key"),
    'section subtitle should not expose the raw section key',
  );
});

test('canvas breadcrumb shows human labels, not raw keys', () => {
  assert.ok(
    editor.includes('humanize(sectionKey'),
    'selection breadcrumb should humanize the section key',
  );
});
