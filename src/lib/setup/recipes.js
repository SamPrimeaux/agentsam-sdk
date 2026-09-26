import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

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
export const imageRasterTransformCapability = {
  id: 'image.raster.transform',
  displayName: 'Raster image transforms',
  description: 'Resize/convert PNG/JPEG/WebP/AVIF via Sharp (preferred) or ImageMagick (optional)',
  risk: 'low',
  requiresApproval: false,
  capabilityProvided: ['image.raster.transform', 'image.raster.inspect'],
  supportedPlatforms: ['darwin', 'linux', 'win32'],
  dependencies: ['sharp'],
  mutations: ['may npm-install sharp in the AgentSam package; optional ImageMagick via OS package manager'],
  installPlans: {
    darwin: {
      provider: 'npm',
      packages: ['sharp'],
      notes: [
        'Sharp is the portable default (declared dependency of @inneranimalmedia/agentsam-sdk-brand).',
        'Optional enrichment: Homebrew imagemagick for ICNS / exotic formats.',
      ],
    },
    linux: {
      provider: 'npm',
      packages: ['sharp'],
      notes: ['Optional: apt/dnf/pacman imagemagick for extended tooling'],
    },
    win32: {
      provider: 'npm',
      packages: ['sharp'],
      notes: ['Optional: winget install ImageMagick.ImageMagick'],
    },
  },
  async detect() {
    let sharpOk = false;
    try {
      require.resolve('sharp');
      sharpOk = true;
    } catch {
      sharpOk = false;
    }
    const magick = (await which('magick')) || (await which('convert'));
    const ok = sharpOk || Boolean(magick);
    return {
      ok,
      detail: sharpOk
        ? 'Sharp available'
        : magick
          ? 'ImageMagick available (Sharp preferred)'
          : 'missing Sharp and ImageMagick',
      version: sharpOk ? 'sharp' : magick ? await versionOf(magick, ['--version']) : null,
      backends: { sharp: sharpOk, imagemagick: Boolean(magick) },
    };
  },
  async verify() {
    return this.detect();
  },
  uninstallHint() {
    return 'Remove optional ImageMagick via your package manager; Sharp uninstalls with the npm package.';
  },
};

/** @type {import('./contract.js').InstallableCapability} */
export const imageVectorizeCapability = {
  id: 'image.vectorize',
  displayName: 'Vector image tooling',
  description: 'Potrace (+ optional ImageMagick/SVGO) for raster→SVG workflows',
  risk: 'low',
  requiresApproval: true,
  capabilityProvided: ['image.vectorize', 'image.optimize'],
  supportedPlatforms: ['darwin', 'linux', 'win32'],
  dependencies: ['potrace'],
  mutations: ['installs OS packages via detected package manager — no shell profile edits'],
  installPlans: {
    darwin: {
      provider: 'homebrew',
      packages: ['potrace'],
      notes: ['Optional: brew install imagemagick; npm i -g svgo'],
    },
    linux: {
      provider: 'apt',
      packages: ['potrace'],
      notes: [
        'Debian/Ubuntu: apt',
        'Fedora: dnf install potrace',
        'Arch: pacman -S potrace',
      ],
    },
    win32: {
      provider: 'winget',
      packages: [],
      notes: ['Install Potrace from https://potrace.sourceforge.net/ or chocolatey if available'],
    },
  },
  async detect() {
    const potrace = await which('potrace');
    const magick = (await which('magick')) || (await which('convert'));
    const ok = Boolean(potrace);
    return {
      ok,
      detail: ok ? 'Potrace available' : 'missing potrace',
      version: potrace ? await versionOf(potrace, ['-v']) : null,
      backends: { potrace: Boolean(potrace), imagemagick: Boolean(magick) },
    };
  },
  async verify() {
    return this.detect();
  },
  uninstallHint() {
    return 'Remove potrace with your platform package manager (brew/apt/dnf/winget) — AgentSam will not invent a command.';
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
  [imageRasterTransformCapability.id]: imageRasterTransformCapability,
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
