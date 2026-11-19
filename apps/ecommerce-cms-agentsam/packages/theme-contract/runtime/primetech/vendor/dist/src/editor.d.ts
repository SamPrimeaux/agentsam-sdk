import type { SceneAnimation, SceneDocument, SceneNode, SceneTransform } from './types.js';
export interface SceneEditorSnapshot {
    document: SceneDocument;
    revision: number;
    canUndo: boolean;
    canRedo: boolean;
}
export declare class SceneEditor {
    #private;
    constructor(document: SceneDocument, options?: {
        historyLimit?: number;
    });
    get revision(): number;
    get document(): SceneDocument;
    snapshot(): SceneEditorSnapshot;
    transact(mutator: (draft: SceneDocument) => void): SceneEditorSnapshot;
    addNode(node: SceneNode): SceneEditorSnapshot;
    updateNode(id: string, patch: Partial<Omit<SceneNode, 'id'>>): SceneEditorSnapshot;
    setNodeTransform(id: string, transform: SceneTransform): SceneEditorSnapshot;
    removeNode(id: string): SceneEditorSnapshot;
    addAnimation(animation: SceneAnimation): SceneEditorSnapshot;
    undo(): SceneEditorSnapshot;
    redo(): SceneEditorSnapshot;
    serialize(pretty?: boolean): string;
}
export declare function createSceneEditor(document: SceneDocument, options?: {
    historyLimit?: number;
}): SceneEditor;
