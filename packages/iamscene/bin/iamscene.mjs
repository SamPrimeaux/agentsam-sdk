#!/usr/bin/env node
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createSceneDocument } from '../dist/src/document.js';
import { validateSceneDocument } from '../dist/src/validate.js';
import { loadSceneFile, saveSceneFile, createOcctSceneAsset } from '../dist/src/node.js';

const [command = 'help', ...args] = process.argv.slice(2);
const flag = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const fileArg = args.find(value => !value.startsWith('--'));

function help() {
  process.stdout.write(`InnerAnimalMedia Scene Toolkit\n\n` +
    `iamscene init <file> [--name <name>]\n` +
    `iamscene validate <file>\n` +
    `iamscene inspect <file>\n` +
    `iamscene normalize <file>\n` +
    `iamscene build-occt <file> [--binary <absolute-path>] [--output <asset-directory>]\n`);
}

try {
  if (command === 'help' || command === '--help' || command === '-h') {
    help();
  } else if (command === 'init') {
    if (!fileArg) throw new Error('iamscene_init_file_required');
    const name = flag('--name') ?? path.basename(fileArg).replace(/\.iamscene\.json$/i, '').replaceAll('-', ' ');
    const document = createSceneDocument({ id: path.basename(fileArg).replace(/[^a-zA-Z0-9._:-]/g, '-').replace(/\.iamscene\.json$/i, ''), name: name || 'New Scene' });
    await saveSceneFile(fileArg, document);
    process.stdout.write(`Created ${path.resolve(fileArg)}\n`);
  } else if (command === 'validate') {
    if (!fileArg) throw new Error('iamscene_validate_file_required');
    const document = await loadSceneFile(fileArg);
    const result = validateSceneDocument(document);
    process.stdout.write(JSON.stringify({ valid: result.valid, sceneId: document.metadata.id, nodeCount: document.scene.nodes.length, animationCount: document.animations.length, errors: result.errors }, null, 2) + '\n');
    if (!result.valid) process.exitCode = 1;
  } else if (command === 'inspect') {
    if (!fileArg) throw new Error('iamscene_inspect_file_required');
    const document = await loadSceneFile(fileArg);
    process.stdout.write(JSON.stringify({
      format: document.format,
      formatVersion: document.formatVersion,
      id: document.metadata.id,
      name: document.metadata.name,
      coordinateSystem: document.coordinateSystem,
      nodes: document.scene.nodes.length,
      assets: document.assets.length,
      occtGeometryNodes: document.scene.nodes.filter(node => node.geometry?.type === 'occt').length,
      animations: document.animations.map(animation => ({ id: animation.id, name: animation.name, duration: animation.duration, tracks: animation.tracks.length })),
    }, null, 2) + '\n');
  } else if (command === 'normalize') {
    if (!fileArg) throw new Error('iamscene_normalize_file_required');
    const document = await loadSceneFile(fileArg);
    await saveSceneFile(fileArg, document);
    process.stdout.write(`Normalized ${path.resolve(fileArg)}\n`);
  } else if (command === 'build-occt') {
    if (!fileArg) throw new Error('iamscene_build_file_required');
    const binary = flag('--binary') ?? process.env.AGENTSAM_OCCT_BIN;
    if (!binary) throw new Error('iamscene_occt_binary_required_use_--binary_or_AGENTSAM_OCCT_BIN');
    const scenePath = path.resolve(fileArg);
    const document = await loadSceneFile(scenePath);
    const outputDir = path.resolve(flag('--output') ?? path.join(path.dirname(scenePath), 'assets'));
    await mkdir(outputDir, { recursive: true });
    const geometryNodes = document.scene.nodes.filter(node => node.geometry?.type === 'occt');
    if (!geometryNodes.length) throw new Error('iamscene_no_occt_geometry_nodes');
    for (const node of geometryNodes) {
      const geometry = node.geometry;
      if (geometry?.type !== 'occt') continue;
      const built = await createOcctSceneAsset({
        binary: path.resolve(binary),
        projectId: document.metadata.id,
        elementId: node.id,
        operations: geometry.operations,
        outputDir,
        fileStem: node.id,
      });
      for (const asset of built.assets) {
        const relative = path.relative(path.dirname(scenePath), path.join(outputDir, path.basename(asset.uri)));
        document.assets = document.assets.filter(existing => existing.id !== asset.id);
        document.assets.push({
          id: asset.id,
          uri: `./${relative.split(path.sep).join('/')}`,
          mediaType: asset.mediaType,
          sha256: asset.sha256,
          role: asset.role,
          sourceNodeId: node.id,
          units: asset.units,
        });
      }
      node.assetRef = `${node.id}-gltf`;
      process.stdout.write(`${node.id}: ${built.volumeMm3.toFixed(3)} mm³ · ${built.assets.length} verified exports\n`);
    }
    await saveSceneFile(scenePath, document);
    process.stdout.write(`Saved ${scenePath}\n`);
  } else {
    help();
    throw new Error(`iamscene_command_unknown:${command}`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
