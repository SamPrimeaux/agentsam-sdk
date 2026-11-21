import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const css = await readFile(new URL("../styles/copro.css",import.meta.url),"utf8");
const app = await readFile(new URL("../../../apps/agentsam-copro-studio/src/MovieModeApp.tsx",import.meta.url),"utf8");
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g,"");

test("CoPro derives every role from the host cms_themes projection, with theme-level overrides",()=>{
  assert.match(css,/--copro-bg:\s*var\(--copro-theme-bg,\s*var\(--nav-canvas\)\)/);
  assert.match(css,/--copro-text:\s*var\(--copro-theme-text,\s*var\(--nav-ink\)\)/);
  assert.match(css,/--copro-accent:\s*var\(--copro-theme-accent,\s*var\(--nav-accent\)\)/);
  assert.match(css,/--copro-accent-ink:\s*var\(--copro-theme-accent-ink,\s*var\(--c-accent-ink\)\)/);
  assert.doesNotMatch(css,/--nav-accent:\s*var\(--copro-accent\)/,"would make the accent circular");
  assert.doesNotMatch(app,/data-nav-theme="dark"/);
  assert.doesNotMatch(app,/appearanceStyle/);
});

test("CoPro ships no palette of its own: no standalone preset and no literal chrome colors",()=>{
  assert.doesNotMatch(css,/\[data-standalone[^\]]*\]\s*\{[^}]*--color-/,"baked standalone preset must not return");
  // Artboard paper is document content (the page a user designs on), not chrome.
  const chrome = withoutComments.split("\n").filter(line=>!/--mm-design-/.test(line)).join("\n");
  const literals = chrome.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|(?<![\w-])(?:white|black)(?![\w-])/g) ?? [];
  assert.deepEqual(literals.filter(value=>value!=="black"),[],"chrome colors must come from theme tokens");
  // `black` is allowed only to derive the shadow tone from the theme background.
  const blackUses = chrome.split("\n").filter(line=>/(?<![\w-])black(?![\w-])/.test(line));
  assert.ok(blackUses.every(line=>/--copro-shadow:/.test(line)),"black only derives --copro-shadow");
});
