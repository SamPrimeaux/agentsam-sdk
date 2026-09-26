/**
 * Agent Sam Google auth for CLI.
 *
 * Default: Local Studio Web OAuth broker (GOOGLE_CLIENT_ID + Worker secret).
 * Optional: --desktop native Desktop PKCE · --web identity login · --sdk gcloud ADC.
 */
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { promptToOpenUrl, openExternalUrl } from '../lib/open-url.js';
import { resolveIamIssuer } from '../../packages/identity/src/contracts/auth-config.js';
import {
  googleCloudPermissionChecklist,
  runGoogleDesktopCloudLogin,
} from '../lib/google-desktop-oauth.js';
import { runGoogleStudioBrokeredCloudLogin } from '../lib/google-studio-brokered-oauth.js';

const execFileAsync = promisify(execFile);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * Hosted Google identity start URL — IAM issuer + /api/oauth/google/start.
 * Requires GOOGLE_CLIENT_ID (or GOOGLE_DESKTOP_CLIENT_ID) in env; server holds secrets.
 * No AGENTSAM_GOOGLE_OAUTH_START / hardcoded product host.
 */
export function resolveGoogleOauthStartUrl(env = process.env, explicit = '') {
  const fromExplicit = clean(explicit);
  if (fromExplicit) return fromExplicit;
  const googleId = clean(env.GOOGLE_CLIENT_ID) || clean(env.GOOGLE_DESKTOP_CLIENT_ID);
  if (!googleId) {
    const err = new Error(
      'GOOGLE_CLIENT_ID (web) or GOOGLE_DESKTOP_CLIENT_ID (desktop) is not configured.',
    );
    err.code = 'google_oauth_not_configured';
    throw err;
  }
  const issuer = resolveIamIssuer(env);
  return new URL('/api/oauth/google/start', `${issuer}/`).toString();
}

function writeLine(write, value = '') {
  write(`${value}\n`);
}

function terminalWidth(stream = output) {
  const cols = Number(stream?.columns) || 80;
  return Math.max(40, Math.min(cols, 120));
}

function wrapText(text, width) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function printBanner(write, title, detailLines = []) {
  const width = terminalWidth();
  const rule = '─'.repeat(Math.min(width - 2, 56));
  writeLine(write, '');
  writeLine(write, `  ${title}`);
  writeLine(write, `  ${rule}`);
  for (const line of detailLines) {
    for (const wrapped of wrapText(line, width - 4)) {
      writeLine(write, `  ${wrapped}`);
    }
  }
  writeLine(write, '');
}

function printAuthHelp(write) {
  printBanner(write, 'Agent Sam · Google auth', [
    'Default: Local Studio Web OAuth broker (Worker holds GOOGLE_CLIENT_SECRET).',
    'Use --desktop for native Desktop PKCE (no secret; requires a true Desktop client Google accepts).',
    'Use --web for hosted identity login, --sdk for native gcloud ADC.',
  ]);
  writeLine(write, '  agentsam gcloud auth login');
  writeLine(write, '  agentsam gcloud auth login --desktop');
  writeLine(write, '  agentsam gcloud auth login --web');
  writeLine(write, '  agentsam gcloud auth login --sdk');
  writeLine(write, '  agentsam gcloud auth login --permissions');
  writeLine(write, '  agentsam gcloud auth login --no-launch-browser');
  writeLine(write, '  agentsam gcloud auth list');
  writeLine(write, '  agentsam gcloud auth revoke [--all]');
  writeLine(write, '  agentsam gcloud auth application-default login');
  writeLine(write, '');
  writeLine(write, `  Hosted identity URL ( --web )`);
  writeLine(write, `    \${IAM_OAUTH_ISSUER}/api/oauth/google/start`);
  writeLine(write, `    requires GOOGLE_CLIENT_ID or GOOGLE_DESKTOP_CLIENT_ID`);
  writeLine(write, '');
}

function printPermissions(write) {
  const checklist = googleCloudPermissionChecklist();
  printBanner(write, 'Agent Sam · Google Cloud permissions', checklist.notes);
  writeLine(write, '  OAuth scopes this CLI requests');
  for (const s of checklist.oauth_scopes_requested) writeLine(write, `    • ${s}`);
  writeLine(write, '');
  writeLine(write, '  Google Auth Platform (Console)');
  for (const row of checklist.oauth_consent_screen) writeLine(write, `    • ${row}`);
  writeLine(write, '');
  writeLine(write, '  GCP project IAM (on the project you operate)');
  for (const row of checklist.project_iam_roles) writeLine(write, `    • ${row}`);
  writeLine(write, '');
}

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

async function waitForEnter(message, { inputStream = input, outputStream = output } = {}) {
  if (!inputStream?.isTTY || !outputStream?.isTTY) {
    outputStream.write(`${message}\n`);
    return false;
  }
  const rl = readline.createInterface({ input: inputStream, output: outputStream });
  try {
    await rl.question(`\n  ${message}\n  `);
    return true;
  } finally {
    rl.close();
  }
}

/**
 * Hosted Google OAuth identity — uses IAM_OAUTH_ISSUER + GOOGLE_CLIENT_ID lane.
 */
export async function runAgentsamGoogleOauthLogin(options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const env = options.env || process.env;
  const startUrl = resolveGoogleOauthStartUrl(env, options.startUrl);
  const noLaunch = Boolean(options.noLaunchBrowser);
  const json = Boolean(options.json);

  printBanner(write, 'Agent Sam · Continue with Google (web identity)', [
    'Hosted Local Studio identity — openid/email/profile only (not Google Cloud scopes).',
    'CLI cannot auto-detect browser completion on this path; prefer default Desktop login for Cloud.',
  ]);

  writeLine(write, '  Authorization URL');
  writeLine(write, `  ${startUrl}`);
  writeLine(write, '');

  if (json) {
    write(JSON.stringify({
      schema_version: 'agentsam-google-oauth-login-v1',
      mode: 'hosted_identity',
      start_url: startUrl,
      scopes: ['openid', 'email', 'profile'],
      note: 'Identity only. Use agentsam gcloud auth login (default) for Google Cloud scopes + auto callback.',
    }, null, 2) + '\n');
    return 0;
  }

  writeLine(write, '  [enter] open browser');
  writeLine(write, '  [c]     cancel');
  writeLine(write, '');

  const interactive =
    Boolean(options.forceInteractive)
    || Boolean(options.choice)
    || Boolean(options.promptToOpenUrlImpl)
    || (input.isTTY && output.isTTY && !options.nonInteractive);

  if (!interactive) {
    writeLine(write, '  Non-interactive shell — open this URL in a browser:');
    writeLine(write, `  ${startUrl}`);
    writeLine(write, '');
    return 0;
  }

  let choice = options.choice || 'enter';
  if (!options.choice) {
    const rl = readline.createInterface({ input, output });
    try {
      const answer = String(await rl.question('  Choice [enter/c]: ')).trim().toLowerCase();
      if (answer === 'c' || answer === 'cancel' || answer === 'q') choice = 'cancel';
      else choice = 'enter';
    } finally {
      rl.close();
    }
  }

  if (choice === 'cancel') {
    writeLine(write, '  Cancelled.');
    return 1;
  }

  if (noLaunch) {
    writeLine(write, '');
    writeLine(write, '  Open the URL above manually, then return here.');
  } else {
    const promptImpl = options.promptToOpenUrlImpl || promptToOpenUrl;
    await promptImpl(startUrl, {
      heading: '  Continue to Agent Sam at:',
      prompt: 'Press ENTER to open Google sign-in in your browser.',
      input: options.input || input,
      output: options.output || output,
      openImpl: options.openImpl || openExternalUrl,
    });
  }

  if (!options.skipCompletionPrompt) {
    await waitForEnter('After you finish in the browser, press ENTER to continue…', {
      inputStream: options.input || input,
      outputStream: options.output || output,
    });
  }
  writeLine(write, '');
  writeLine(write, '  ✓ Hosted identity step acknowledged.');
  writeLine(write, '  For Google Cloud scopes + automatic completion, run:');
  writeLine(write, '    agentsam gcloud auth login');
  writeLine(write, '');
  return 0;
}

async function runSdkGcloudLogin({ write, env, pass = [], noLaunch = false }) {
  printBanner(write, 'Agent Sam · Google Cloud SDK login', [
    'This opens Google Cloud SDK OAuth (Continue to Google Cloud SDK).',
    'Redirect stays on localhost — expected for the gcloud client.',
  ]);
  const args = ['auth', 'login', ...pass];
  if (noLaunch && !pass.includes('--no-launch-browser')) {
    args.push('--no-launch-browser');
  }
  const result = await spawnGcloudInteractive(args, env);
  if (!result.ok) {
    writeLine(write, '');
    writeLine(write, '  ✕ gcloud auth login failed.');
    writeLine(write, '    Tip: agentsam gcloud auth login --sdk --no-launch-browser');
    writeLine(write, '');
    return result.code || 1;
  }
  writeLine(write, '');
  writeLine(write, '  ✓ Google Cloud SDK login complete.');
  writeLine(write, '  Next: agentsam google-cloud doctor');
  writeLine(write, '');
  return 0;
}

/**
 * @param {string[]} argv  args after `auth`
 */
export async function runGcloudAuth(argv = [], options = {}) {
  const write = options.write || ((s) => process.stdout.write(s));
  const env = options.env || process.env;
  const json = argv.includes('--json') || Boolean(options.json);
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
    const pass = args.slice(1);
    if (pass.includes('--permissions') || pass.includes('--scopes')) {
      if (json) write(JSON.stringify(googleCloudPermissionChecklist(), null, 2) + '\n');
      else printPermissions(write);
      return 0;
    }
    const useSdk = pass.includes('--sdk') || pass.includes('--gcloud-sdk');
    const useWeb = pass.includes('--web') || pass.includes('--hosted');
    const useDesktop = pass.includes('--desktop') || pass.includes('--pkce');
    const noLaunch = pass.includes('--no-launch-browser');
    const cleanPass = pass.filter(
      (a) =>
        a !== '--sdk'
        && a !== '--gcloud-sdk'
        && a !== '--web'
        && a !== '--hosted'
        && a !== '--desktop'
        && a !== '--pkce'
        && a !== '--no-launch-browser'
        && a !== '--permissions'
        && a !== '--scopes',
    );

    if (useSdk) {
      return runSdkGcloudLogin({ write, env, pass: cleanPass, noLaunch });
    }
    if (useWeb) {
      return runAgentsamGoogleOauthLogin({
        write,
        env,
        json,
        noLaunchBrowser: noLaunch,
        nonInteractive: options.nonInteractive,
        promptToOpenUrlImpl: options.promptToOpenUrlImpl,
        openImpl: options.openImpl,
        input: options.input,
        output: options.output,
        startUrl: options.startUrl,
        choice: options.choice,
        skipCompletionPrompt: options.skipCompletionPrompt,
      });
    }

    try {
      if (useDesktop) {
        await runGoogleDesktopCloudLogin({
          write,
          env,
          json,
          noLaunchBrowser: noLaunch,
          home: options.home,
          promptToOpenUrlImpl: options.promptToOpenUrlImpl,
          openImpl: options.openImpl,
          input: options.input,
          output: options.output,
          fetchImpl: options.fetchImpl,
          createServerImpl: options.createServerImpl,
          disableOsStore: options.disableOsStore,
          storeCredential: options.storeCredential,
          writeConnection: options.writeConnection,
        });
      } else {
        await runGoogleStudioBrokeredCloudLogin({
          write,
          env,
          json,
          noLaunchBrowser: noLaunch,
          home: options.home,
          promptToOpenUrlImpl: options.promptToOpenUrlImpl,
          openImpl: options.openImpl,
          input: options.input,
          output: options.output,
          fetchImpl: options.fetchImpl,
          createServerImpl: options.createServerImpl,
          disableOsStore: options.disableOsStore,
          storeCredential: options.storeCredential,
          writeConnection: options.writeConnection,
        });
      }
      return 0;
    } catch (error) {
      writeLine(write, '');
      writeLine(write, `  ✕ ${error?.message || error}`);
      writeLine(write, '  Tip: agentsam gcloud auth login --permissions');
      writeLine(write, '');
      return 1;
    }
  }

  if (args[0] === 'application-default' && args[1] === 'login') {
    writeLine(write, '');
    writeLine(write, '  Agent Sam · application-default credentials');
    writeLine(write, '  Used by libraries/ADC — separate from Agent Sam Desktop Google OAuth.');
    writeLine(write, '');
    const result = await spawnGcloudInteractive(['auth', 'application-default', 'login', ...args.slice(2)], env);
    return result.ok ? 0 : result.code || 1;
  }

  if (args[0] === 'revoke') {
    const result = await spawnGcloudInteractive(['auth', 'revoke', ...args.slice(1)], env);
    return result.ok ? 0 : result.code || 1;
  }

  const result = await spawnGcloudInteractive(['auth', ...args], env);
  return result.ok ? 0 : result.code || 1;
}
