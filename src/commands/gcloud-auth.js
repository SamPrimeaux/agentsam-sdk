/**
 * Wrap native `gcloud auth` for AgentSam UX.
 *
 * Important: Google Cloud SDK's own OAuth also uses http://localhost:<port>/ —
 * that is RFC 8252, not a temporary AgentSam shortcut. AgentSam-hosted
 * https://agentsam.inneranimalmedia.com/... redirects are for Identity/Connections
 * (web + Local Studio), not for replacing gcloud's native client.
 */
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function writeLine(write, value = '') {
  write(`${value}\n`);
}

function printAuthHelp(write) {
  writeLine(write, '');
  writeLine(write, '  Agent Sam · gcloud auth');
  writeLine(write, '');
  writeLine(write, '  agentsam gcloud auth login');
  writeLine(write, '  agentsam gcloud auth login --no-launch-browser');
  writeLine(write, '  agentsam gcloud auth list');
  writeLine(write, '  agentsam gcloud auth revoke [--all]');
  writeLine(write, '  agentsam gcloud auth application-default login');
  writeLine(write, '');
  writeLine(write, '  This opens Google\'s real OAuth consent (Google Cloud SDK client).');
  writeLine(write, '  Redirect stays on localhost — same pattern Google uses (see gcloud auth login URL).');
  writeLine(write, '');
  writeLine(write, '  For AgentSam-hosted Google login (web / Local Studio Connections):');
  writeLine(write, '    https://agentsam.inneranimalmedia.com/api/oauth/google/start');
  writeLine(write, '    Setup: docs/contracts/google-cloud-oauth-setup.md');
  writeLine(write, '');
}

/**
 * Interactive gcloud — inherit stdio so the browser login flow works.
 */
function spawnGcloudInteractive(args, env) {
  return new Promise((resolve) => {
    const child = spawn('gcloud', args, {
      env,
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', (error) => {
      resolve({ ok: false, code: 1, error: error.message });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, code: code ?? 1 });
    });
  });
}

async function runGcloudCapture(args, env, timeoutMs = 30000) {
  try {
    const { stdout, stderr } = await execFileAsync('gcloud', args, {
      timeout: timeoutMs,
      env,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { ok: true, code: 0, stdout: String(stdout || ''), stderr: String(stderr || '') };
  } catch (error) {
    return {
      ok: false,
      code: Number(error?.code) || 1,
      stdout: String(error?.stdout || ''),
      stderr: String(error?.stderr || error?.message || ''),
    };
  }
}

/**
 * @param {string[]} argv  args after `auth`
 */
export async function runGcloudAuth(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const env = options.env || process.env;
  const json = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');

  if (!args.length || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printAuthHelp(write);
    return 0;
  }

  if (args[0] === 'list') {
    const result = await runGcloudCapture(
      ['auth', 'list', '--format=table(account,status)'],
      env,
    );
    if (json) {
      const parsed = await runGcloudCapture(['auth', 'list', '--format=json'], env);
      write((parsed.stdout || '[]') + (parsed.stdout?.endsWith('\n') ? '' : '\n'));
      return parsed.ok ? 0 : 1;
    }
    if (!result.ok) {
      write(result.stderr || result.stdout);
      return 1;
    }
    writeLine(write, '');
    writeLine(write, '  Agent Sam · gcloud auth list');
    writeLine(write, '');
    write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
    return 0;
  }

  if (args[0] === 'login') {
    writeLine(write, '');
    writeLine(write, '  Agent Sam · Google Cloud auth login');
    writeLine(write, '');
    writeLine(write, '  Opening Google Cloud SDK OAuth consent in your browser.');
    writeLine(write, '  (Google\'s redirect is localhost — that is expected for CLI.)');
    writeLine(write, '');
    const pass = args.slice(1);
    const result = await spawnGcloudInteractive(['auth', 'login', ...pass], env);
    if (!result.ok) {
      writeLine(write, '');
      writeLine(write, '  ✕ gcloud auth login failed.');
      writeLine(write, '    Tip: agentsam gcloud auth login --no-launch-browser');
      writeLine(write, '    Then open the printed URL manually.');
      writeLine(write, '');
      return result.code || 1;
    }
    writeLine(write, '');
    writeLine(write, '  ✓ gcloud auth login complete.');
    writeLine(write, '  Next:');
    writeLine(write, '    agentsam google-cloud doctor');
    writeLine(write, '    agentsam google-cloud projects list');
    writeLine(write, '    agentsam google-cloud iam service-accounts list');
    writeLine(write, '');
    return 0;
  }

  if (args[0] === 'application-default' && args[1] === 'login') {
    writeLine(write, '');
    writeLine(write, '  Agent Sam · application-default credentials');
    writeLine(write, '  Used by libraries/ADC — separate from `gcloud auth login` user session.');
    writeLine(write, '');
    const result = await spawnGcloudInteractive(['auth', 'application-default', 'login', ...args.slice(2)], env);
    return result.ok ? 0 : result.code || 1;
  }

  if (args[0] === 'revoke') {
    const result = await spawnGcloudInteractive(['auth', 'revoke', ...args.slice(1)], env);
    return result.ok ? 0 : result.code || 1;
  }

  // Pass through unknown auth subcommands to gcloud
  const result = await spawnGcloudInteractive(['auth', ...args], env);
  return result.ok ? 0 : result.code || 1;
}
