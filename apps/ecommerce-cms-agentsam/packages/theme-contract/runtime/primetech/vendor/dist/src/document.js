import { assertValidSceneDocument, validateSceneDocument } from './validate.js';
export const IAMSCENE_SCHEMA_URI = 'https://schemas.inneranimalmedia.com/iamscene/v1/scene.schema.json';
export const IAMSCENE_FORMAT_VERSION = '1.0.0';
export function createSceneDocument(options) {
    const now = new Date().toISOString();
    const rootId = 'scene-root';
    const document = {
        $schema: IAMSCENE_SCHEMA_URI,
        format: 'iamscene',
        formatVersion: IAMSCENE_FORMAT_VERSION,
        metadata: {
            id: options.id,
            name: options.name,
            ...(options.description ? { description: options.description } : {}),
            ...(options.author ? { author: options.author } : {}),
            ...(options.assetBaseUri ? { assetBaseUri: options.assetBaseUri } : {}),
            ...(options.tags ? { tags: [...options.tags] } : {}),
            createdAt: now,
            modifiedAt: now,
            ...options.metadata,
        },
        coordinateSystem: { handedness: 'right', upAxis: 'Y', distanceUnit: 'm' },
        assets: [],
        materials: [],
        scene: {
            rootNodeIds: [rootId],
            nodes: [{ id: rootId, name: 'Scene', kind: 'group', transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, visible: true }],
        },
        camera: { projection: 'perspective', position: [0, 2.5, 6], target: [0, 0, 0], fov: 40, near: 0.01, far: 1000 },
        environment: { background: '#05080d', ambientIntensity: 0.3, lights: [] },
        animations: [],
        interactions: [],
        extensionsUsed: [],
        extensionsRequired: [],
    };
    assertValidSceneDocument(document);
    return document;
}
export function cloneSceneDocument(document) {
    return structuredClone(document);
}
export function parseSceneDocument(source) {
    const text = typeof source === 'string'
        ? source
        : new TextDecoder().decode(source instanceof Uint8Array ? source : new Uint8Array(source));
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (error) {
        throw new Error(`iamscene_json_parse_failed:${error instanceof Error ? error.message : String(error)}`);
    }
    assertValidSceneDocument(parsed);
    return parsed;
}
export function serializeSceneDocument(document, pretty = true) {
    assertValidSceneDocument(document);
    return `${JSON.stringify(document, null, pretty ? 2 : 0)}\n`;
}
export function migrateSceneDocument(value) {
    const result = validateSceneDocument(value);
    if (result.valid)
        return cloneSceneDocument(value);
    const candidate = value;
    if (candidate?.format !== 'iamscene')
        throw new Error('iamscene_format_not_supported');
    throw new Error(`iamscene_migration_not_available:${String(candidate.formatVersion ?? 'unknown')}`);
}
//# sourceMappingURL=document.js.map