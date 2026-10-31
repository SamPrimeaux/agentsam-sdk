import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

test('public Brand import and input validation do not load native sharp; rendering fails honestly when unavailable', (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'agentsam-brand-import-'));
  t.after(() => rmSync(directory, { recursive:true, force:true }));
  const manifestPath = path.join(directory, 'manifest.json');
  const outDir = path.join(directory, 'output');
  writeFileSync(manifestPath, JSON.stringify({
    schema:'agentsam.brand-iconography.v1', app_icons:[], colorways:[], source_catalog:'catalog.json',
  }));
  writeFileSync(path.join(directory, 'catalog.json'), JSON.stringify({
    schema:'agentsam.brand-system-icons.v1', icon_count:0, icons:[],
  }));
  const packageEntry = new URL('../src/index.js', import.meta.url).href;
  const code = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    import { existsSync } from 'node:fs';
    let nativeResolutions = 0;
    registerHooks({ resolve(specifier, context, nextResolve) {
      if (specifier === 'sharp') {
        nativeResolutions += 1;
        throw Object.assign(new Error('native sharp intentionally unavailable'), {code:'ERR_NATIVE_UNAVAILABLE'});
      }
      return nextResolve(specifier, context);
    } });
    const brand = await import(${JSON.stringify(packageEntry)});
    assert.equal(typeof brand.buildIconographyPack, 'function');
    assert.equal(typeof brand.createEmptyBrandPack, 'function');
    assert.equal(nativeResolutions, 0, 'unrelated imports must not resolve native rendering');
    await assert.rejects(brand.buildIconographyPack(), /requires manifestPath and outDir/);
    assert.equal(nativeResolutions, 0, 'invalid input must fail before loading native processing');
    await assert.rejects(brand.buildIconographyPack(${JSON.stringify({manifestPath,outDir})}), {code:'ERR_NATIVE_UNAVAILABLE'});
    assert.equal(nativeResolutions, 1, 'actual rendering resolves its native dependency');
    assert.equal(existsSync(${JSON.stringify(outDir)}), false, 'unavailable renderer must not create output');
    console.log('native import boundary verified');
  `;
  assert.match(execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding:'utf8', cwd:fileURLToPath(new URL('..', import.meta.url)),
  }), /native import boundary verified/);
});
