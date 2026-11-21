import { cloneSceneDocument, serializeSceneDocument } from './document.js';
import { assertValidSceneDocument } from './validate.js';
import type { SceneAnimation, SceneDocument, SceneNode, SceneTransform } from './types.js';

export interface SceneEditorSnapshot {
  document: SceneDocument;
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
}

export class SceneEditor {
  #document: SceneDocument;
  #past: SceneDocument[] = [];
  #future: SceneDocument[] = [];
  #revision = 0;
  #historyLimit: number;

  constructor(document: SceneDocument, options: { historyLimit?: number } = {}) {
    assertValidSceneDocument(document);
    this.#document = cloneSceneDocument(document);
    this.#historyLimit = Math.max(1, Math.floor(options.historyLimit ?? 80));
  }

  get revision(): number { return this.#revision; }
  get document(): SceneDocument { return cloneSceneDocument(this.#document); }

  snapshot(): SceneEditorSnapshot {
    return { document: this.document, revision: this.#revision, canUndo: this.#past.length > 0, canRedo: this.#future.length > 0 };
  }

  transact(mutator: (draft: SceneDocument) => void): SceneEditorSnapshot {
    const draft = cloneSceneDocument(this.#document);
    mutator(draft);
    draft.metadata.modifiedAt = new Date().toISOString();
    assertValidSceneDocument(draft);
    this.#past.push(this.#document);
    if (this.#past.length > this.#historyLimit) this.#past.shift();
    this.#document = draft;
    this.#future = [];
    this.#revision += 1;
    return this.snapshot();
  }

  addNode(node: SceneNode): SceneEditorSnapshot {
    return this.transact(draft => {
      if (draft.scene.nodes.some(item => item.id === node.id)) throw new Error(`iamscene_node_exists:${node.id}`);
      draft.scene.nodes.push(structuredClone(node));
      if (!node.parentId) draft.scene.rootNodeIds.push(node.id);
    });
  }

  updateNode(id: string, patch: Partial<Omit<SceneNode, 'id'>>): SceneEditorSnapshot {
    return this.transact(draft => {
      const node = draft.scene.nodes.find(item => item.id === id);
      if (!node) throw new Error(`iamscene_node_not_found:${id}`);
      Object.assign(node, structuredClone(patch));
    });
  }

  /** Swap presentation geometry without replacing the node or its transforms/history. */
  setNodeGeometryAsset(id: string, assetRef: string): SceneEditorSnapshot {
    return this.transact(draft => {
      const node = draft.scene.nodes.find(item => item.id === id);
      if (!node || node.kind !== 'mesh') throw new Error(`iamscene_mesh_node_not_found:${id}`);
      if (!draft.assets.some(asset => asset.id === assetRef))
        throw new Error(`iamscene_asset_not_found:${assetRef}`);
      node.assetRef = assetRef;
    });
  }

  setNodeTransform(id: string, transform: SceneTransform): SceneEditorSnapshot {
    return this.updateNode(id, { transform: structuredClone(transform) });
  }

  removeNode(id: string): SceneEditorSnapshot {
    return this.transact(draft => {
      const removed = new Set<string>([id]);
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
      for (const animation of draft.animations) animation.tracks = animation.tracks.filter(track => !removed.has(track.targetId));
      draft.interactions = draft.interactions.filter(interaction => !removed.has(interaction.targetId));
    });
  }

  addAnimation(animation: SceneAnimation): SceneEditorSnapshot {
    return this.transact(draft => {
      if (draft.animations.some(item => item.id === animation.id)) throw new Error(`iamscene_animation_exists:${animation.id}`);
      draft.animations.push(structuredClone(animation));
    });
  }

  undo(): SceneEditorSnapshot {
    const previous = this.#past.pop();
    if (!previous) return this.snapshot();
    this.#future.push(this.#document);
    this.#document = previous;
    this.#revision += 1;
    return this.snapshot();
  }

  redo(): SceneEditorSnapshot {
    const next = this.#future.pop();
    if (!next) return this.snapshot();
    this.#past.push(this.#document);
    this.#document = next;
    this.#revision += 1;
    return this.snapshot();
  }

  serialize(pretty = true): string { return serializeSceneDocument(this.#document, pretty); }
}

export function createSceneEditor(document: SceneDocument, options?: { historyLimit?: number }): SceneEditor {
  return new SceneEditor(document, options);
}
