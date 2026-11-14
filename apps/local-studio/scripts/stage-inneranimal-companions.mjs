#!/usr/bin/env node
/** Stage the versioned InnerAnimal runtime art into Local Studio's public assets. */
import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(appRoot, '../../assets/brand/inneranimal-companions/v1');
const publicRoot = path.join(appRoot, 'frontend/public/brand/inneranimal-companions/v1');
const expected = ['geaux', 'meaux', 'coder', 'architect', 'engineer', 'py', 'bella', 'roux', 'bruneaux', 'nyra', 'toro'];
const catalogPath = path.join(sourceRoot, 'catalog.json');
if (!existsSync(catalogPath)) throw new Error('InnerAnimal companion source catalog is missing: ' + catalogPath);
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
if (catalog.defaultCompanionId !== 'geaux' || !Array.isArray(catalog.companions)) {
  throw new Error('InnerAnimal companion catalog contract is invalid');
}
const found = new Set(catalog.companions.map((item) => item.id));
const habitatsPath = path.join(sourceRoot, 'habitats.json');
if (!existsSync(habitatsPath)) throw new Error('InnerAnimal habitat manifest is missing: ' + habitatsPath);
const habitatManifest = JSON.parse(readFileSync(habitatsPath, 'utf8'));
if (!Array.isArray(habitatManifest.habitats) || habitatManifest.habitats.length < 4) {
  throw new Error('InnerAnimal habitat manifest must include the founding family and expansion habitats.');
}

function apngFrameCount(file) {
  const bytes = readFileSync(file);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL') return bytes.readUInt32BE(offset + 8);
    offset += length + 12;
  }
  return 0;
}

for (const id of expected) {
  if (!found.has(id)) throw new Error('Required companion missing from source catalog: ' + id);
  const folder = path.join(sourceRoot, id);
  const manifestPath = path.join(folder, 'companion.json');
  if (!existsSync(manifestPath)) throw new Error('Companion runtime manifest missing: ' + manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.id !== id || !['pending', 'approved'].includes(manifest.visualApproval)) {
    throw new Error('Companion identity/review status invalid: ' + id);
  }
  for (const [state, asset] of Object.entries(manifest.states || {})) {
    const assetPath = path.join(folder, asset.src);
    if (!existsSync(assetPath) || statSync(assetPath).size < 1000) {
      throw new Error(`Companion ${id} ${state} APNG missing or unexpectedly small`);
    }
    const actualFrames = apngFrameCount(assetPath);
    if (actualFrames !== asset.frames) throw new Error(`Companion ${id} ${state} APNG frame count mismatch: ${actualFrames} != ${asset.frames}`);
  }
  for (const asset of [manifest.avatar, manifest.icon, manifest.portrait]) {
    if (!asset || !existsSync(path.join(folder, asset))) throw new Error('Companion portrait asset missing: ' + id);
  }
  if (id === 'bella') {
    if (!Array.isArray(manifest.galleryStates) || manifest.galleryStates.length !== 16) throw new Error('Bella must expose all 16 gallery states.');
    for (const state of manifest.galleryStates) {
      const assetPath = path.join(folder, state.src);
      if (!existsSync(assetPath) || apngFrameCount(assetPath) !== state.frames || state.frames !== 8) {
        throw new Error(`Bella gallery state ${state.id} is not a valid 8-frame APNG.`);
      }
    }
    if (manifest.animationFrameCount !== 128 || Object.keys(manifest.states).length !== 10) {
      throw new Error('Bella runtime/gallery state contract is invalid.');
    }
  }
}
for (const pack of catalog.costumePacks || []) {
  const packPath = path.join(sourceRoot, pack.companionId, 'costume-packs', pack.id, 'pack.json');
  if (!existsSync(packPath)) throw new Error('Companion costume pack manifest missing: ' + pack.id);
  const costumePack = JSON.parse(readFileSync(packPath, 'utf8'));
  if (costumePack.id !== pack.id || costumePack.companionId !== pack.companionId || costumePack.costumeDirections?.length !== pack.directionCount || costumePack.costumeDirections.some((direction) => !direction.visualEnhancement || !direction.signatureMotion)) {
    throw new Error('Companion costume pack contract invalid: ' + pack.id);
  }
}
const planned = catalog.companions.filter((item) => item.status === 'planned');
for (const item of planned) {
  const manifestPath = path.join(sourceRoot, item.id, 'companion.json');
  if (!existsSync(manifestPath)) throw new Error('Planned companion brief missing: ' + item.id);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.id !== item.id || manifest.status !== 'planned' || manifest.availability !== 'coming-soon') {
    throw new Error('Planned companion manifest contract invalid: ' + item.id);
  }
  if (!Array.isArray(manifest.habitatIds) || !manifest.habitatIds.length || !Array.isArray(manifest.capabilities) || !manifest.signatureAction) {
    throw new Error('Planned companion profile is missing habitat, capability, or signature metadata: ' + item.id);
  }
  if (Object.keys(manifest.states || {}).length || manifest.avatar || manifest.icon || manifest.portrait) {
    throw new Error('Planned companion must not advertise unavailable runtime art: ' + item.id);
  }
}
mkdirSync(path.dirname(publicRoot), { recursive: true });
cpSync(sourceRoot, publicRoot, { recursive: true, force: true });
console.log(`[inneranimal-companions] staged ${expected.length} runtime companions, ${planned.length} planned profiles, ${habitatManifest.habitats.length} habitats, and ${(catalog.costumePacks || []).length} costume packs into ${publicRoot}`);
