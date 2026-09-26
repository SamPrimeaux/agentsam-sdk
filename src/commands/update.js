/**
 * gcloud-like update preview. Does not silently upgrade.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pkg from '../../package.json' with { type: 'json' };

const execFileAsync = promisify(execFile);

function writeLine(write, value = '') {
  write(`${value}\n`);
}

async function latestNpmVersion(name, env) {
  try {
    const { stdout } = await execFileAsync('npm', ['view', name, 'version'], {
      timeout: 20000,
      env,
      maxBuffer: 64 * 1024,
    });
    return String(stdout || '').trim() || null;
  } catch {
    return null;
  }
}

export async function runUpdate(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const env = options.env || process.env;
  const json = argv.includes('--json');
  const apply = argv.includes('--apply') || argv.includes('-y');

  const current = pkg.version;
  const available = await latestNpmVersion('@inneranimalmedia/agentsam-sdk', env);

  const payload = {
    schema_version: 'agentsam-update-v1',
    current: {
      sdk: current,
      package: '@inneranimalmedia/agentsam-sdk',
    },
    available: {
      sdk: available,
    },
    changes: available && available !== current
      ? [
          { component: 'AgentSam CLI / SDK', from: current, to: available },
        ]
      : [],
    breaking_changes: [],
    migration: [],
    native_notes: [
      'If npm warns about allow-scripts for node-pty/protobufjs:',
      '  npm config set allow-scripts=node-pty,protobufjs --location=user',
      '  npm rebuild node-pty protobufjs',
    ],
    installer_note:
      '/install/studio currently installs the SDK CLI globally; signed Local Studio .app install is a separate graduation ticket.',
  };

  if (json) {
    write(JSON.stringify(payload, null, 2) + '\n');
    return 0;
  }

  writeLine(write, '');
  writeLine(write, '  Agent Sam update');
  writeLine(write, '');
  writeLine(write, '  Current');
  writeLine(write, `    SDK             ${current}`);
  writeLine(write, '');
  writeLine(write, '  Available');
  writeLine(write, `    SDK             ${available || '(could not query npm registry)'}`);
  writeLine(write, '');

  if (!available) {
    writeLine(write, '  ✕ Could not determine latest version. Check network / npm auth.');
    writeLine(write, '');
    return 1;
  }

  if (available === current) {
    writeLine(write, '  ✓ Already on the latest published SDK.');
    writeLine(write, '');
    writeLine(write, '  Notes');
    for (const note of payload.native_notes) writeLine(write, `    ${note}`);
    writeLine(write, `    ${payload.installer_note}`);
    writeLine(write, '');
    return 0;
  }

  writeLine(write, '  Changes');
  for (const row of payload.changes) {
    writeLine(write, `    ${row.component.padEnd(28)} ${row.from} → ${row.to}`);
  }
  writeLine(write, '');
  writeLine(write, '  Breaking changes');
  writeLine(write, '    none reported by this preview (read release notes before applying)');
  writeLine(write, '');
  writeLine(write, '  Native dependency tip');
  for (const note of payload.native_notes) writeLine(write, `    ${note}`);
  writeLine(write, '');
  writeLine(write, '  Installer note');
  writeLine(write, `    ${payload.installer_note}`);
  writeLine(write, '');

  if (!apply) {
    writeLine(write, '  [enter] not auto-run from non-interactive CLI');
    writeLine(write, '  Apply with:');
    writeLine(write, '    npm install -g @inneranimalmedia/agentsam-sdk@latest');
    writeLine(write, '    agentsam update --apply   # prints the same npm command guidance');
    writeLine(write, '');
    return 0;
  }

  writeLine(write, '  Applying via npm (global)…');
  try {
    const { stdout, stderr } = await execFileAsync(
      'npm',
      ['install', '-g', `@inneranimalmedia/agentsam-sdk@${available}`],
      { timeout: 300000, env, maxBuffer: 4 * 1024 * 1024 },
    );
    if (stdout) write(stdout.endsWith('\n') ? stdout : `${stdout}\n`);
    if (stderr) write(stderr.endsWith('\n') ? stderr : `${stderr}\n`);
    writeLine(write, '');
    writeLine(write, '  Verifying…');
    writeLine(write, '    ✓ package install attempted');
    writeLine(write, '    → run: agentsam --version && agentsam status');
    writeLine(write, '    → if PTY scripts were blocked:');
    writeLine(write, '         npm config set allow-scripts=node-pty,protobufjs --location=user');
    writeLine(write, '         npm rebuild node-pty protobufjs');
    writeLine(write, '');
    return 0;
  } catch (error) {
    write(String(error?.stderr || error?.message || error));
    writeLine(write, '');
    writeLine(write, '  ✕ Update failed. No silent fallback.');
    return 1;
  }
}
