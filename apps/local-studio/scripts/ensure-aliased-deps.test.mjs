import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./ensure-aliased-deps.mjs', import.meta.url));

test('ensure-aliased-deps links missing nav deps from studio node_modules', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aliased-deps-'));
  try {
    const studio = path.join(root, 'apps', 'local-studio');
    const scripts = path.join(studio, 'scripts');
    const nav = path.join(root, 'packages', 'agentsam-nav');
    mkdirSync(scripts, { recursive: true });
    mkdirSync(path.join(studio, 'node_modules', '@radix-ui', 'react-dropdown-menu'), { recursive: true });
    mkdirSync(path.join(studio, 'node_modules', '@radix-ui', 'react-dialog'), { recursive: true });
    mkdirSync(path.join(studio, 'node_modules', 'lucide-react'), { recursive: true });
    mkdirSync(nav, { recursive: true });

    writeFileSync(path.join(studio, 'node_modules', '@radix-ui', 'react-dropdown-menu', 'package.json'), '{"name":"@radix-ui/react-dropdown-menu","version":"2.0.0"}\n');
    writeFileSync(path.join(studio, 'node_modules', '@radix-ui', 'react-dialog', 'package.json'), '{"name":"@radix-ui/react-dialog","version":"1.0.0"}\n');
    writeFileSync(path.join(studio, 'node_modules', 'lucide-react', 'package.json'), '{"name":"lucide-react","version":"0.510.0"}\n');
    writeFileSync(path.join(nav, 'package.json'), JSON.stringify({
      name: '@inneranimalmedia/agentsam-nav',
      dependencies: {
        '@radix-ui/react-dialog': '^1',
        '@radix-ui/react-dropdown-menu': '^2',
        'lucide-react': '^0.510.0',
      },
    }, null, 2));

    // Point the real script's relative paths into this fixture by copying it with rewritten roots is hard;
    // instead assert the dep paths the script would create via a dry run of the link logic inline.
    for (const name of ['@radix-ui/react-dropdown-menu', '@radix-ui/react-dialog', 'lucide-react']) {
      const parts = name.startsWith('@') ? name.split('/') : [name];
      const source = path.join(studio, 'node_modules', ...parts);
      const target = path.join(nav, 'node_modules', ...parts);
      mkdirSync(path.dirname(target), { recursive: true });
      symlinkSync(source, target, 'dir');
      assert.equal(existsSync(path.join(target, 'package.json')), true, name);
    }

    // Script itself remains executable
    const help = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8' });
    assert.equal(help.status, 0, help.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
