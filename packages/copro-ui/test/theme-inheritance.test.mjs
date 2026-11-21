import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("MovieMode theme reads host semantic colors instead of forcing cyan/dark",async()=>{
 const css=await readFile(new URL("../styles/copro.css",import.meta.url),"utf8");
 const app=await readFile(new URL("../../../apps/agentsam-copro-studio/src/MovieModeApp.tsx",import.meta.url),"utf8");
 assert.match(css,/\.copro-app-root\s*\{/);
 assert.match(css,/--copro-accent:\s*var\(--color-ring,/);
 assert.match(css,/--copro-bg:\s*var\(--color-background,/);
 assert.doesNotMatch(css,/--copro-theme-/);
 assert.doesNotMatch(app,/data-nav-theme="dark"/);
 assert.doesNotMatch(app,/appearanceStyle/);
});
