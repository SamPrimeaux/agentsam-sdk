import readline from 'node:readline';
import { spawn } from 'node:child_process';

function normalizeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('URL is required');
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw new Error(`Invalid URL: ${raw}`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }
  return parsed.toString();
}

export function browserCommand(url, platform = process.platform) {
  const normalized = normalizeHttpUrl(url);
  if (platform === 'darwin') return { command: 'open', args: [normalized] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', normalized] };
  return { command: 'xdg-open', args: [normalized] };
}

export function openExternalUrl(url, {
  platform = process.platform,
  spawnImpl = spawn,
} = {}) {
  const invocation = browserCommand(url, platform);
  const child = spawnImpl(invocation.command, invocation.args, {
    stdio: 'ignore',
    detached: true,
  });
  child.unref?.();
  return invocation;
}

export async function promptToOpenUrl(url, {
  heading = 'Open in your browser:',
  prompt = 'Press ENTER to open in the browser, or copy the URL above.',
  input = process.stdin,
  output = process.stdout,
  openImpl = openExternalUrl,
} = {}) {
  const normalized = normalizeHttpUrl(url);
  output.write(`\n${heading}\n${normalized}\n`);

  if (!input?.isTTY || !output?.isTTY) {
    output.write('Open the URL above in a browser to continue.\n\n');
    return { url: normalized, opened: false, interactive: false };
  }

  const rl = readline.createInterface({ input, output });
  try {
    await new Promise(resolve => rl.question(`\n${prompt}\n`, resolve));
  } finally {
    rl.close();
  }

  try {
    openImpl(normalized);
    output.write('\nBrowser opened. Complete the step there, then return here.\n\n');
    return { url: normalized, opened: true, interactive: true };
  } catch (error) {
    output.write(`\nCould not open the browser automatically: ${error.message}\nOpen the URL above manually.\n\n`);
    return { url: normalized, opened: false, interactive: true, error: error.message };
  }
}
