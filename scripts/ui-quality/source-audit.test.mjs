import assert from 'node:assert/strict';
import test from 'node:test';
import { auditUiSource } from './source-audit.mjs';

test('rejects inaccessible and inline-styled JSX', () => {
  const input = [
    'export const Example = () => <section>',
    '  <button onClick={() => {}}><SearchIcon /></button>',
    '  <img src="/photo.png" />',
    '  <div style={{ display: "grid" }}>Hello</div>',
    '  <div onClick={() => {}}>Click</div>',
    '</section>;',
  ].join('\n');
  assert.deepEqual(auditUiSource(input, 'Example.tsx').map((f) => f.rule).sort(), [
    'control-name', 'image-alt', 'inline-style', 'nonsemantic-action',
  ]);
});

test('accepts labelled buttons, alt and CSS custom-property bindings', () => {
  const input = [
    'export const Good = ({ width }) => <main>',
    '  <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Close panel"><X /></button></TooltipTrigger><TooltipContent>Close panel</TooltipContent></Tooltip>',
    '  <img src="/decor.svg" alt="" />',
    '  <div className="w-[var(--panel-width)]" style={{ "--panel-width": width }}>Hello</div>',
    '  <button type="button">Save</button>',
    '</main>;',
  ].join('\n');
  assert.deepEqual(auditUiSource(input, 'Good.tsx'), []);
});

test('named icon actions require discoverable helper without duplicate tooltip enforcement', () => {
  const bad = 'export const Bad = () => <button aria-label="Delete"><Trash /></button>;';
  assert.deepEqual(auditUiSource(bad, 'Bad.tsx').map((f) => f.rule), ['icon-helper']);
  const good = 'export const Good = () => <Tooltip><TooltipTrigger asChild><button aria-label="Delete"><Trash /></button></TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip>;';
  assert.deepEqual(auditUiSource(good, 'Good.tsx'), []);
});

test('HTML requires img alt and forbids inline style', () => {
  const findings = auditUiSource('<img src="a.png"><p style="color: red">Hi</p>', 'index.html');
  assert.deepEqual(findings.map((f) => f.rule), ['image-alt', 'inline-static-style']);
});
