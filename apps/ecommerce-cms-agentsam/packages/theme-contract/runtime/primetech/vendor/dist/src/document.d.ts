import type { SceneDocument, SceneMetadata } from './types.js';
export declare const IAMSCENE_SCHEMA_URI = "https://schemas.inneranimalmedia.com/iamscene/v1/scene.schema.json";
export declare const IAMSCENE_FORMAT_VERSION: "1.0.0";
export interface CreateSceneDocumentOptions {
    id: string;
    name: string;
    description?: string;
    author?: string;
    assetBaseUri?: string;
    tags?: string[];
    metadata?: Partial<SceneMetadata>;
}
export declare function createSceneDocument(options: CreateSceneDocumentOptions): SceneDocument;
export declare function cloneSceneDocument(document: SceneDocument): SceneDocument;
export declare function parseSceneDocument(source: string | Uint8Array | ArrayBuffer): SceneDocument;
export declare function serializeSceneDocument(document: SceneDocument, pretty?: boolean): string;
export declare function migrateSceneDocument(value: unknown): SceneDocument;
