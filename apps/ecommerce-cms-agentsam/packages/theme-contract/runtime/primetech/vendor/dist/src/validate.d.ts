import type { SceneDocument, SceneValidationResult } from './types.js';
export declare function validateSceneDocument(value: unknown): SceneValidationResult;
export declare function assertValidSceneDocument(value: unknown): asserts value is SceneDocument;
