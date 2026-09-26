import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

async function which(bin) {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await execFileAsync(cmd, [bin], { timeout: 5000 });
    const path = String(stdout || '').trim().split(/\r?\n/)[0];
    return path || null;
  } catch {
    return null;
  }
}

async function versionOf(bin, args = ['--version']) {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 8000 });
    const text = `${stdout || ''}${stderr || ''}`.trim().split(/\n/)[0];
    return text.slice(0, 120) || null;
  } catch {
    return null;
  }
}

/**
 * Discover host environment for setup planning.
 */
export async function discoverEnvironment(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const arch = options.arch || os.arch();
  const hostname = os.hostname().replace(/\.local$/i, '');

  const nodeVersion = process.versions.node;
  const brew = platform === 'darwin' || platform === 'linux' ? await which('brew') : null;
  const git = await which('git');
  const docker = await which('docker');
  const gcloud = await which('gcloud');
  const wrangler = await which('wrangler');
  const magick = (await which('magick')) || (await which('convert'));
  const potrace = await which('potrace');
  const ffmpeg = await which('ffmpeg');
  const svgo = await which('svgo');

  let wranglerVersion = null;
  if (wrangler) wranglerVersion = await versionOf(wrangler, ['--version']);
  else {
    try {
      wranglerVersion = require('wrangler/package.json').version;
    } catch {
      wranglerVersion = null;
    }
  }

  const hostLabel =
    platform === 'darwin' ? 'Mac'
      : platform === 'win32' ? 'PC'
        : 'host';

  return {
    schema_version: 'agentsam-setup-environment-v1',
    hostname,
    host_label: hostLabel,
    platform,
    arch,
    os_release: os.release(),
    node: nodeVersion,
    tools: {
      brew: brew ? { path: brew, version: await versionOf('brew', ['--version']) } : null,
      git: git ? { path: git, version: await versionOf('git', ['--version']) } : null,
      docker: docker ? { path: docker, version: await versionOf('docker', ['--version']) } : null,
      gcloud: gcloud ? { path: gcloud, version: await versionOf('gcloud', ['--version']) } : null,
      wrangler: wrangler || wranglerVersion
        ? { path: wrangler, version: wranglerVersion }
        : null,
      magick: magick ? { path: magick, version: await versionOf(magick, ['--version']) } : null,
      potrace: potrace ? { path: potrace, version: await versionOf('potrace', ['-v']) } : null,
      ffmpeg: ffmpeg ? { path: ffmpeg, version: await versionOf('ffmpeg', ['-version']) } : null,
      svgo: svgo ? { path: svgo, version: await versionOf('svgo', ['--version']) } : null,
    },
    env_flags: {
      AGENTSAM_API_KEY: Boolean(String(env.AGENTSAM_API_KEY || '').trim()),
      GOOGLE_CLIENT_ID: Boolean(String(env.GOOGLE_CLIENT_ID || '').trim()),
      GOOGLE_DESKTOP_CLIENT_ID: Boolean(String(env.GOOGLE_DESKTOP_CLIENT_ID || '').trim()),
    },
  };
}

export function renderEnvironment(env) {
  const lines = [
    '',
    '  Environment',
    `    ${env.host_label} · ${env.hostname}`,
    `    ${env.platform} ${env.arch} · Node ${env.node}`,
  ];
  const rows = [
    ['Homebrew', env.tools.brew],
    ['Git', env.tools.git],
    ['Docker', env.tools.docker],
    ['Google Cloud CLI', env.tools.gcloud],
    ['Wrangler', env.tools.wrangler],
    ['ImageMagick', env.tools.magick],
    ['Potrace', env.tools.potrace],
    ['ffmpeg', env.tools.ffmpeg],
  ];
  for (const [label, tool] of rows) {
    lines.push(`    ${tool ? '✓' : '○'} ${label}${tool?.version ? ` · ${String(tool.version).slice(0, 40)}` : ''}`);
  }
  lines.push('');
  return lines.join('\n');
}
