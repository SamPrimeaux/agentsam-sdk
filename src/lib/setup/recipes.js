import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function which(bin) {
  try {
    const { stdout } = await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [bin], { timeout: 5000 });
    return String(stdout || '').trim().split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

async function versionOf(bin, args) {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 8000 });
    return `${stdout || ''}${stderr || ''}`.trim().split(/\n/)[0].slice(0, 80);
  } catch {
    return null;
  }
}

/** @type {import('./contract.js').InstallableCapability} */
export const imageVectorizeCapability = {
  id: 'image.vectorize',
  displayName: 'Vector image tooling',
  description: 'ImageMagick + Potrace (+ optional SVGO) for optimize/vectorize workflows',
  risk: 'low',
  requiresApproval: true,
  capabilityProvided: ['image.optimize', 'image.vectorize'],
  supportedPlatforms: ['darwin', 'linux'],
  dependencies: ['imagemagick', 'potrace'],
  mutations: ['installs Homebrew packages only — no shell profile edits'],
  installPlans: {
    darwin: {
      provider: 'homebrew',
      packages: ['imagemagick', 'potrace'],
      notes: ['Optional: npm i -g svgo for SVG multipass optimize'],
    },
    linux: {
      provider: 'apt',
      packages: ['imagemagick', 'potrace'],
      notes: ['Or: brew install imagemagick potrace if Linuxbrew is available'],
    },
  },
  async detect() {
    const magick = (await which('magick')) || (await which('convert'));
    const potrace = await which('potrace');
    const ok = Boolean(magick && potrace);
    return {
      ok,
      detail: ok ? 'ImageMagick + Potrace available' : 'missing imagemagick and/or potrace',
      version: magick ? await versionOf(magick, ['--version']) : null,
    };
  },
  async verify() {
    return this.detect();
  },
  uninstallHint() {
    return 'brew uninstall imagemagick potrace';
  },
};

/** @type {import('./contract.js').InstallableCapability} */
export const googleCloudCapability = {
  id: 'google.cloud',
  displayName: 'Google Cloud connection',
  description: 'gcloud CLI + Agent Sam Desktop/Web OAuth + connection preference',
  risk: 'medium',
  requiresApproval: true,
  capabilityProvided: ['google.cloud.auth', 'google.cloud.doctor'],
  supportedPlatforms: ['darwin', 'linux', 'win32'],
  dependencies: ['gcloud'],
  mutations: [
    'may open browser for OAuth',
    'writes ~/.agentsam/connections/google-cloud.json',
    'may store google-cloud token in OS keychain / vault',
  ],
  installPlans: {
    darwin: {
      provider: 'homebrew',
      packages: ['--cask', 'google-cloud-sdk'],
      notes: [
        'After gcloud: agentsam gcloud auth login',
        'Then: agentsam google-cloud connection set --identity EMAIL --project PROJECT',
        'Inspect: agentsam setup google.cloud --inventory',
        'Doctor: agentsam google-cloud doctor --json',
      ],
    },
    linux: {
      provider: 'manual',
      commands: ['# install Google Cloud SDK: https://cloud.google.com/sdk/docs/install'],
      notes: ['Then agentsam gcloud auth login'],
    },
    win32: {
      provider: 'winget',
      packages: ['Google.CloudSDK'],
      notes: ['Then agentsam gcloud auth login'],
    },
  },
  async detect() {
    const gcloud = await which('gcloud');
    if (!gcloud) return { ok: false, detail: 'gcloud not on PATH' };
    const version = await versionOf('gcloud', ['--version']);
    return { ok: true, detail: 'gcloud available', version };
  },
  async verify() {
    return this.detect();
  },
  uninstallHint() {
    return 'brew uninstall --cask gcloud-cli   # or remove Google Cloud SDK';
  },
};

/** @type {import('./contract.js').InstallableCapability} */
export const cloudflareWranglerCapability = {
  id: 'cloudflare.wrangler',
  displayName: 'Cloudflare Wrangler',
  description: 'Wrangler CLI for Workers / D1 / deploy',
  risk: 'low',
  requiresApproval: true,
  capabilityProvided: ['cloudflare.wrangler'],
  supportedPlatforms: ['darwin', 'linux', 'win32'],
  dependencies: ['wrangler'],
  mutations: ['npm/global or project-local install'],
  installPlans: {
    darwin: { provider: 'npm', packages: ['wrangler@latest'], notes: ['Prefer repo-local npx wrangler'] },
    linux: { provider: 'npm', packages: ['wrangler@latest'] },
    win32: { provider: 'npm', packages: ['wrangler@latest'] },
  },
  async detect() {
    const wrangler = await which('wrangler');
    if (wrangler) {
      return { ok: true, detail: 'wrangler on PATH', version: await versionOf('wrangler', ['--version']) };
    }
    return { ok: false, detail: 'wrangler not on PATH (npx wrangler may still work in this repo)' };
  },
  async verify() {
    return this.detect();
  },
  uninstallHint() {
    return 'npm uninstall -g wrangler';
  },
};

export const CAPABILITY_RECIPES = Object.freeze({
  [imageVectorizeCapability.id]: imageVectorizeCapability,
  [googleCloudCapability.id]: googleCloudCapability,
  [cloudflareWranglerCapability.id]: cloudflareWranglerCapability,
});

export function listCapabilityRecipes() {
  return Object.values(CAPABILITY_RECIPES);
}

export function getCapabilityRecipe(id) {
  return CAPABILITY_RECIPES[String(id || '').trim()] || null;
}
