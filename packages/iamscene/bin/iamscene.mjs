#!/usr/bin/env node
import path from 'node:path';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createIAMSceneFormatRegistry } from '../dist/src/format-registry.js';
import { createSceneDocument } from '../dist/src/document.js';
import { validateSceneDocument } from '../dist/src/validate.js';
import { loadSceneFile, saveSceneFile, createOcctSceneAsset, createIAMSceneNativeFormatRegistry } from '../dist/src/node.js';

const [command = 'help', ...args] = process.argv.slice(2);
const flag = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const fileArg = args.find(value => !value.startsWith('--'));

function help() {
  process.stdout.write(`InnerAnimalMedia Scene Toolkit\n\n` +
    `iamscene init <file> [--name <name>]\n` +
    `iamscene validate <file>\n` +
    `iamscene inspect <file>\n` +
    `iamscene formats [--binary <native-occt>]\n` +
    `iamscene export <scene.iamscene.json> --out <file.step|file.brep|file.ifc> --binary <native-occt>\n` +
    `iamscene verify <file> [--units m|cm|mm|in|ft]\n` +
    `iamscene convert <file> [--units m|cm|mm|in|ft] [--out <scene.iamscene.json>]\n` +
    `iamscene normalize <file>\n` +
    `iamscene build-occt <file> [--binary <absolute-path>] [--output <asset-directory>]\n`);
}

try {
  if (command === 'help' || command === '--help' || command === '-h') {
    help();
  } else if (command === 'formats') {
    const binary = flag('--binary') ?? process.env.AGENTSAM_OCCT_BIN;
    const registry = binary ? await createIAMSceneNativeFormatRegistry({binary:path.resolve(binary)}) : createIAMSceneFormatRegistry();
    process.stdout.write(JSON.stringify(registry.list(), null, 2) + '\n');
  } else if (command === 'export') {
    if (!fileArg || !flag('--out')) throw new Error('iamscene_export_input_and_output_required');
    const binary = flag('--binary') ?? process.env.AGENTSAM_OCCT_BIN;
    if (!binary) throw new Error('iamscene_export_native_binary_required');
    const target = path.resolve(flag('--out'));
    const input = path.resolve(fileArg);
    if (target===input) throw new Error('iamscene_export_source_overwrite_forbidden');
    try { await access(target); throw new Error('iamscene_export_destination_exists:' + target); }
    catch(error) { if(error.code !== 'ENOENT') throw error; }
    const registry = await createIAMSceneNativeFormatRegistry({binary:path.resolve(binary)});
    const document = await loadSceneFile(input);
    const exported = await registry.export(target,{kind:'scene',value:document});
    await mkdir(path.dirname(target),{recursive:true});
    await writeFile(target,exported.bytes,{flag:'wx'});
    process.stdout.write(JSON.stringify({input,target,format:exported.format,bytes:exported.bytes.byteLength,
      warnings:exported.warnings},null,2)+'\n');
  } else if (command === 'verify' || command === 'convert') {
    if (!fileArg) throw new Error('iamscene_format_file_required');
    const inputPath = path.resolve(fileArg);
    const registry = createIAMSceneFormatRegistry();
    const descriptor = registry.identify(inputPath);
    const source = new Uint8Array(await readFile(inputPath));
    const outPath = path.resolve(flag('--out') ?? `${inputPath}.iamscene.json`);
    const outputDir = path.dirname(outPath);
    const relativeSource = './' + path.relative(outputDir, inputPath).replaceAll('\\','/');
    const importOptions = { id: path.basename(inputPath).replace(/[^a-zA-Z0-9._:-]/g, '-'),
      assetUri: relativeSource, ...(flag('--units') ? { sourceUnits: flag('--units') } : {}) };
    const reference = await registry.reference(inputPath, source);
    const receipt = { filename: inputPath, format: descriptor.id, operations: descriptor.operations,
      sourceIntegrity: {sha256: reference.sha256, byteLength: reference.byteLength, scope:'source-bytes-only'},
      ...(descriptor.operations.import !== 'implemented' ? {semanticImport: 'unavailable', reason: descriptor.limitations} : {}) };
    if (descriptor.operations.import !== 'implemented') {
      process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
      process.exitCode = 2;
    } else {
      const imported = await registry.import(inputPath, source, importOptions);
      receipt.semanticImport = 'implemented';
      receipt.importWarnings = imported.warnings;
      receipt.generatedFiles = imported.generatedFiles?.map(file=>({uri:file.uri,byteLength:file.bytes.byteLength})) ?? [];
      if (descriptor.operations['round-trip'] === 'implemented') {
        const resolveUri = async uri => {
          if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith('//')) throw new Error('iamscene_external_uri_not_allowed');
          return new Uint8Array(await readFile(path.resolve(path.dirname(inputPath),uri)));
        };
        receipt.roundTrip = await registry.roundTrip(inputPath,source,{...importOptions,resolveUri});
        if (!receipt.roundTrip.passed) process.exitCode = 1;
      } else receipt.roundTrip = {status:'unavailable'};
      if (command === 'convert') {
        if (imported.document.kind !== 'scene') throw new Error('iamscene_convert_requires_scene');
        if (outPath === inputPath) throw new Error('iamscene_convert_source_overwrite_forbidden');
        const targets = (imported.generatedFiles || []).map(f=>({ file:f,path:path.resolve(outputDir,f.uri) }));
        for (const dest of [outPath,...targets.map(t=>t.path)]) {
          try { await access(dest); throw new Error('iamscene_convert_destination_exists:' + dest); }
          catch(error) { if (error.code !== 'ENOENT') throw error; }
          if (dest !== outPath && !dest.startsWith(outputDir + path.sep)) throw new Error('iamscene_convert_path_escape');
        }
        await mkdir(outputDir,{recursive:true});
        for (const target of targets) await writeFile(target.path,target.file.bytes,{flag:'wx'});
        await writeFile(outPath, JSON.stringify(imported.document.value,null,2)+'\n',{flag:'wx'});
        receipt.outputScene = outPath;
      }
      process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
    }
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
