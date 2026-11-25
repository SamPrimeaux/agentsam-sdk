import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SDK_NAME = '@inneranimalmedia/agentsam-sdk';
const CONSUMERS = ['backend', 'frontend', 'shared/agentsam'];

function lstatOrNull(target) {
  try { return fs.lstatSync(target); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function linkLocalSdk({ repoRoot, localStudioRoot }) {
  const sdkManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  if (sdkManifest.name !== SDK_NAME) {
    throw new Error(`Expected ${SDK_NAME} at ${repoRoot}; found ${sdkManifest.name ?? 'unnamed package'}`);
  }

  return CONSUMERS.map((consumer) => {
    const scopeDir = path.join(localStudioRoot, consumer, 'node_modules', '@inneranimalmedia');
    const target = path.join(scopeDir, 'agentsam-sdk');
    fs.mkdirSync(scopeDir, { recursive: true });

    const stat = lstatOrNull(target);
    if (stat?.isSymbolicLink()) {
      const current = path.resolve(path.dirname(target), fs.readlinkSync(target));
      if (current === path.resolve(repoRoot)) return { consumer, status: 'already-linked' };
      fs.unlinkSync(target);
    } else if (stat) {
      if (!stat.isDirectory()) throw new Error(`Refusing to replace non-directory SDK target: ${target}`);
      const installedManifestPath = path.join(target, 'package.json');
      if (!fs.existsSync(installedManifestPath)) throw new Error(`Refusing to replace unrecognized package at ${target}`);
      const installedManifest = JSON.parse(fs.readFileSync(installedManifestPath, 'utf8'));
      if (installedManifest.name !== SDK_NAME) {
        throw new Error(`Refusing to replace ${installedManifest.name ?? 'unknown package'} at ${target}`);
      }
      fs.rmSync(target, { recursive: true, force: true });
    }

    fs.symlinkSync(path.resolve(repoRoot), target, process.platform === 'win32' ? 'junction' : 'dir');
    return { consumer, status: 'linked' };
  });
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const localStudioRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(localStudioRoot, '../..');
const results = linkLocalSdk({ repoRoot, localStudioRoot });
for (const result of results) console.log(`${result.status}: ${result.consumer} -> ${repoRoot}`);
