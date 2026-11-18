import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PORTABLE_SECTION_STYLES} from '../backend/cms/portable-styles.compiled.mjs';

test('the published native stock stylesheet is compiled from the exact shared preview CSS',()=>{
 const original=readFileSync(new URL('../packages/theme-contract/runtime/portable-sections.css',import.meta.url),'utf8');
 const digest=x=>createHash('sha256').update(x).digest('hex');
 assert.equal(digest(PORTABLE_SECTION_STYLES),digest(original),
  'Recompile portable-styles.compiled.mjs when the native stylesheet changes.');
 assert.match(PORTABLE_SECTION_STYLES,/\.ps-section/);
 assert.match(PORTABLE_SECTION_STYLES,/@media/);
});
