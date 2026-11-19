import { cloneSceneDocument, serializeSceneDocument } from './document.js';
import { assertValidSceneDocument } from './validate.js';
export class SceneEditor {
    #document;
    #past = [];
    #future = [];
    #revision = 0;
    #historyLimit;
    constructor(document, options = {}) {
        assertValidSceneDocument(document);
        this.#document = cloneSceneDocument(document);
        this.#historyLimit = Math.max(1, Math.floor(options.historyLimit ?? 80));
    }
    get revision() { return this.#revision; }
    get document() { return cloneSceneDocument(this.#document); }
    snapshot() {
        return { document: this.document, revision: this.#revision, canUndo: this.#past.length > 0, canRedo: this.#future.length > 0 };
    }
    transact(mutator) {
        const draft = cloneSceneDocument(this.#document);
        mutator(draft);
        draft.metadata.modifiedAt = new Date().toISOString();
        assertValidSceneDocument(draft);
        this.#past.push(this.#document);
        if (this.#past.length > this.#historyLimit)
            this.#past.shift();
        this.#document = draft;
        this.#future = [];
        this.#revision += 1;
        return this.snapshot();
    }
    addNode(node) {
        return this.transact(draft => {
            if (draft.scene.nodes.some(item => item.id === node.id))
                throw new Error(`iamscene_node_exists:${node.id}`);
            draft.scene.nodes.push(structuredClone(node));
            if (!node.parentId)
                draft.scene.rootNodeIds.push(node.id);
        });
    }
    updateNode(id, patch) {
        return this.transact(draft => {
            const node = draft.scene.nodes.find(item => item.id === id);
            if (!node)
                throw new Error(`iamscene_node_not_found:${id}`);
            Object.assign(node, structuredClone(patch));
        });
    }
    setNodeTransform(id, transform) {
        return this.updateNode(id, { transform: structuredClone(transform) });
    }
    removeNode(id) {
        return this.transact(draft => {
            const removed = new Set([id]);
            let changed = true;
            while (changed) {
                changed = false;
                for (const node of draft.scene.nodes) {
                    if (node.parentId && removed.has(node.parentId) && !removed.has(node.id)) {
                        removed.add(node.id);
                        changed = true;
                    }
                }
            }
            draft.scene.nodes = draft.scene.nodes.filter(node => !removed.has(node.id));
            draft.scene.rootNodeIds = draft.scene.rootNodeIds.filter(rootId => !removed.has(rootId));
            for (const animation of draft.animations)
                animation.tracks = animation.tracks.filter(track => !removed.has(track.targetId));
            draft.interactions = draft.interactions.filter(interaction => !removed.has(interaction.targetId));
        });
    }
    addAnimation(animation) {
        return this.transact(draft => {
            if (draft.animations.some(item => item.id === animation.id))
                throw new Error(`iamscene_animation_exists:${animation.id}`);
            draft.animations.push(structuredClone(animation));
        });
    }
    undo() {
        const previous = this.#past.pop();
        if (!previous)
            return this.snapshot();
        this.#future.push(this.#document);
        this.#document = previous;
        this.#revision += 1;
        return this.snapshot();
    }
    redo() {
        const next = this.#future.pop();
        if (!next)
            return this.snapshot();
        this.#past.push(this.#document);
        this.#document = next;
        this.#revision += 1;
        return this.snapshot();
    }
    serialize(pretty = true) { return serializeSceneDocument(this.#document, pretty); }
}
export function createSceneEditor(document, options) {
    return new SceneEditor(document, options);
}
//# sourceMappingURL=editor.js.map