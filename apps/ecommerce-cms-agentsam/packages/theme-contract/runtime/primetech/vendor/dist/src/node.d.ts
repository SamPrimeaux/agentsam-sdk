import type { OcctGeometrySource, SceneDocument } from './types.js';
export type OcctExportFormat = 'gltf' | 'step' | 'brep';
export interface CreateOcctSceneAssetOptions {
    binary: string;
    projectId: string;
    elementId: string;
    operations: OcctGeometrySource['operations'];
    outputDir: string;
    fileStem?: string;
    deflection?: number;
    formats?: OcctExportFormat[];
}
export interface OcctSceneAssetResult {
    engine: 'occt';
    projectId: string;
    elementId: string;
    revision: number;
    fingerprint: string;
    volumeMm3: number;
    assets: Array<{
        id: string;
        uri: string;
        mediaType: string;
        role: 'presentation' | 'geometry-source';
        units: 'm' | 'mm';
        sha256: string;
        bytes: number;
        receipt: unknown;
    }>;
}
export declare function createOcctSceneAsset(options: CreateOcctSceneAssetOptions): Promise<OcctSceneAssetResult>;
export declare function loadSceneFile(filePath: string): Promise<SceneDocument>;
export declare function saveSceneFile(filePath: string, document: SceneDocument): Promise<void>;
