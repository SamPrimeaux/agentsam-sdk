import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { evidenceError } from './contract.js';
import { createBlenderSource, createLocalBlenderExec } from './driver-blender.js';
import { createDeriver } from './derive.js';
import { createPlaywrightSource } from './driver-playwright.js';
import { createCoproExporter } from './exporter-copro.js';
import { createGitFacts } from './facts.js';
import { createFfprobeMedia } from './media.js';
import { PROJECT_RE } from './naming.js';
import { createLocalEvidenceStore } from './store.js';

const run = promisify(execFile);

async function available(binary, args = ['-version']) {
  try { await run(binary, args, { timeout: 15000 }); return true; } catch { return false; }
}

/** Resolve from the project first (its own node_modules), then from the SDK. Nothing is installed or assumed. */
async function load(root, names) {
  const require = createRequire(path.join(root, 'package.json'));
  for (const name of names) {
    try { return { name, module: await import(pathToFileURL(require.resolve(name)).href) }; } catch { /* try next */ }
  }
  for (const name of names) {
    try { return { name, module: await import(name) }; } catch { /* try next */ }
  }
  return null;
}

/**
 * A local host for the evidence pack: store under <root>/.agentsam/evidence, the project id from the
 * project's own agentsam.app.json (if it has one), and only the adapters that are really present.
 * `report` says exactly what is wired, so "installed" is never assumed.
 */
export async function createLocalEvidenceHost({ root, readableRoots = [] } = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw evidenceError('evidence_host_root_required');
  const storeRoot = path.join(root, '.agentsam', 'evidence');
  let project = null;
  try {
    const manifest = JSON.parse(await readFile(path.join(root, 'agentsam.app.json'), 'utf8'));
    if (typeof manifest.id === 'string' && PROJECT_RE.test(manifest.id)) project = manifest.id;
  } catch { /* no project manifest: the caller must pass a project */ }

  const roots = [root, ...readableRoots];
  const options = {
    store: createLocalEvidenceStore({ root: storeRoot }),
    resolveTrustedContext: async () => ({ actorId: 'local-operator', ...(project ? { project } : {}) }),
    authorize: async ({ action }) => action === 'evidence.write' || action === 'evidence.read',
    readableRoots: roots, sources: {}, exporters: {}, facts: createGitFacts({ cwd: root }),
  };
  const adapters = { media: null, derive: null, playwright: null, blenderCamera: null, copro: null, facts: 'git' };

  if ((await available('ffprobe')) && (await available('ffmpeg'))) { options.media = createFfprobeMedia(); adapters.media = 'ffprobe'; }
  const sharpModule = await load(root, ['sharp']);
  if (sharpModule) {
    const sharp = sharpModule.module.default ?? sharpModule.module;
    try { options.derive = createDeriver({ sharp }); options.images = { sharp }; adapters.derive = 'sharp'; } catch { /* unusable sharp */ }
  }
  const playwright = await load(root, ['playwright', 'playwright-core']);
  if (playwright) { options.sources.playwright = createPlaywrightSource({ playwright: playwright.module }); adapters.playwright = playwright.name; }
  if (await available('blender', ['--version'])) {
    options.sources['blender-camera'] = createBlenderSource({ exec: createLocalBlenderExec(), readableRoots: roots });
    adapters.blenderCamera = 'blender';
  }
  const copro = await load(root, ['@inneranimalmedia/copro-project']);
  if (copro) { options.exporters.copro = createCoproExporter({ copro: copro.module }); adapters.copro = copro.name; }

  return { options, report: { root, store: storeRoot, project, readableRoots: roots, adapters } };
}
