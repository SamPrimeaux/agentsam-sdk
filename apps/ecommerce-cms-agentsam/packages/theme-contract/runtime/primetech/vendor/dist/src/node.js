import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createOcctSession } from '@inneranimalmedia/agentsam-occt/session';
import { parseSceneDocument, serializeSceneDocument } from './document.js';
const MIME = {
    gltf: 'model/gltf+json',
    step: 'model/step',
    brep: 'application/vnd.opencascade.brep',
};
function safeStem(value) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value))
        throw new Error('iamscene_asset_stem_invalid');
    return value;
}
export async function createOcctSceneAsset(options) {
    if (!path.isAbsolute(options.binary))
        throw new Error('iamscene_occt_absolute_binary_required');
    if (!path.isAbsolute(options.outputDir))
        throw new Error('iamscene_occt_absolute_output_dir_required');
    if (!options.operations.length)
        throw new Error('iamscene_occt_operations_required');
    if (!options.operations.some(operation => operation.id === options.elementId))
        throw new Error('iamscene_occt_element_not_in_feature_history');
    const outputDir = await realpath(options.outputDir).catch(async () => {
        await mkdir(options.outputDir, { recursive: true });
        return realpath(options.outputDir);
    });
    const stem = safeStem(options.fileStem ?? options.elementId);
    const formats = [...new Set(options.formats ?? ['gltf', 'step', 'brep'])];
    const session = createOcctSession({ binary: options.binary });
    const createdFiles = [];
    try {
        await session.request({ action: 'open', projectId: options.projectId });
        for (const operation of options.operations)
            await session.request({ action: 'apply', operation });
        const mesh = await session.request({ action: 'mesh', id: options.elementId, deflection: options.deflection ?? 0.25 });
        if (!Number.isFinite(mesh.volume_mm3) || mesh.volume_mm3 <= 0 || !Array.isArray(mesh.indices) || mesh.indices.length < 3) {
            throw new Error('iamscene_occt_mesh_receipt_invalid');
        }
        const assets = [];
        for (const format of formats) {
            const filename = `${stem}.${format}`;
            const target = path.join(outputDir, filename);
            const receipt = await session.request({ action: 'export', format, id: options.elementId, path: target, deflection: options.deflection ?? 0.25 });
            const fileStat = await stat(target);
            if (!fileStat.isFile() || fileStat.size < 100)
                throw new Error(`iamscene_occt_export_invalid:${format}`);
            const bytes = await readFile(target);
            createdFiles.push(target);
            assets.push({
                id: `${options.elementId}-${format}`,
                uri: `./${filename}`,
                mediaType: MIME[format],
                role: format === 'gltf' ? 'presentation' : 'geometry-source',
                units: format === 'gltf' ? 'm' : 'mm',
                sha256: createHash('sha256').update(bytes).digest('hex'),
                bytes: bytes.length,
                receipt,
            });
        }
        return {
            engine: 'occt',
            projectId: options.projectId,
            elementId: options.elementId,
            revision: Number(mesh.revision),
            fingerprint: String(mesh.fingerprint),
            volumeMm3: Number(mesh.volume_mm3),
            assets,
        };
    }
    catch (error) {
        await Promise.all(createdFiles.map(file => rm(file, { force: true }).catch(() => undefined)));
        throw error;
    }
    finally {
        session.close();
    }
}
export async function loadSceneFile(filePath) {
    const absolute = path.resolve(filePath);
    return parseSceneDocument(await readFile(absolute));
}
export async function saveSceneFile(filePath, document) {
    const absolute = path.resolve(filePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    const temporary = `${absolute}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, serializeSceneDocument(document), 'utf8');
        await rename(temporary, absolute);
    }
    catch (error) {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
    }
}
//# sourceMappingURL=node.js.map