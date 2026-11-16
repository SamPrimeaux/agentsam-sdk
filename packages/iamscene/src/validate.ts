import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import schema from '../schema/iamscene.v1.schema.json' with { type: 'json' };
import type { SceneDocument, SceneValidationIssue, SceneValidationResult } from './types.js';

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
const validateSchema = ajv.compile(schema);

function issue(path: string, message: string, keyword?: string): SceneValidationIssue {
  return { path, message, ...(keyword ? { keyword } : {}) };
}

export function validateSceneDocument(value: unknown): SceneValidationResult {
  const errors: SceneValidationIssue[] = [];
  if (!validateSchema(value)) {
    for (const error of (validateSchema.errors ?? []) as ErrorObject[]) {
      errors.push(issue(error.instancePath || '/', error.message ?? 'schema_validation_failed', error.keyword));
    }
    return { valid: false, errors };
  }

  const document = value as unknown as SceneDocument;
  const ids = new Set<string>();
  const nodeIds = new Set<string>();
  const assetIds = new Set<string>();
  const materialIds = new Set<string>();
  const animationIds = new Set<string>();
  const addUnique = (id: string, collection: Set<string>, path: string) => {
    if (collection.has(id)) errors.push(issue(path, `duplicate_id:${id}`, 'uniqueId'));
    collection.add(id);
  };

  for (const asset of document.assets) addUnique(asset.id, assetIds, `/assets/${asset.id}/id`);
  for (const material of document.materials) addUnique(material.id, materialIds, `/materials/${material.id}/id`);
  for (const node of document.scene.nodes) {
    addUnique(node.id, nodeIds, `/scene/nodes/${node.id}/id`);
    ids.add(node.id);
  }
  for (const animation of document.animations) addUnique(animation.id, animationIds, `/animations/${animation.id}/id`);

  const nodeById = new Map(document.scene.nodes.map(node => [node.id, node]));
  for (const rootId of document.scene.rootNodeIds) {
    if (!nodeById.has(rootId)) errors.push(issue('/scene/rootNodeIds', `unknown_root_node:${rootId}`, 'reference'));
    else if (nodeById.get(rootId)?.parentId) errors.push(issue(`/scene/nodes/${rootId}/parentId`, 'root_node_cannot_have_parent', 'sceneGraph'));
  }
  for (const node of document.scene.nodes) {
    if (node.parentId && !nodeById.has(node.parentId)) errors.push(issue(`/scene/nodes/${node.id}/parentId`, `unknown_parent:${node.parentId}`, 'reference'));
    if (node.assetRef && !assetIds.has(node.assetRef)) errors.push(issue(`/scene/nodes/${node.id}/assetRef`, `unknown_asset:${node.assetRef}`, 'reference'));
    if (node.materialRef && !materialIds.has(node.materialRef)) errors.push(issue(`/scene/nodes/${node.id}/materialRef`, `unknown_material:${node.materialRef}`, 'reference'));
    if (node.pathRef && !nodeById.has(node.pathRef)) errors.push(issue(`/scene/nodes/${node.id}/pathRef`, `unknown_path:${node.pathRef}`, 'reference'));
    if (node.kind === 'path' && node.geometry?.type !== 'polyline') errors.push(issue(`/scene/nodes/${node.id}/geometry`, 'path_requires_polyline_geometry', 'sceneGraph'));
    if (node.kind === 'pulse' && !node.pathRef) errors.push(issue(`/scene/nodes/${node.id}/pathRef`, 'pulse_requires_path_reference', 'sceneGraph'));
  }

  for (const node of document.scene.nodes) {
    const visited = new Set<string>();
    let current: typeof node | undefined = node;
    while (current?.parentId) {
      if (visited.has(current.id)) {
        errors.push(issue(`/scene/nodes/${node.id}/parentId`, 'scene_graph_cycle', 'sceneGraph'));
        break;
      }
      visited.add(current.id);
      current = nodeById.get(current.parentId);
    }
  }

  for (const animation of document.animations) {
    for (const track of animation.tracks) {
      if (!nodeIds.has(track.targetId)) errors.push(issue(`/animations/${animation.id}/tracks/${track.id}/targetId`, `unknown_animation_target:${track.targetId}`, 'reference'));
      if (track.keyframes.length < 2) errors.push(issue(`/animations/${animation.id}/tracks/${track.id}/keyframes`, 'animation_track_requires_two_keyframes', 'animation'));
      let previous = -Infinity;
      for (const frame of track.keyframes) {
        if (frame.time < previous) errors.push(issue(`/animations/${animation.id}/tracks/${track.id}/keyframes`, 'keyframes_must_be_sorted', 'animation'));
        if (frame.time > animation.duration) errors.push(issue(`/animations/${animation.id}/tracks/${track.id}/keyframes`, 'keyframe_exceeds_animation_duration', 'animation'));
        previous = frame.time;
      }
    }
  }
  for (const interaction of document.interactions) {
    if (!nodeIds.has(interaction.targetId)) errors.push(issue(`/interactions/${interaction.id}/targetId`, `unknown_interaction_target:${interaction.targetId}`, 'reference'));
    if (!animationIds.has(interaction.action.animationId)) errors.push(issue(`/interactions/${interaction.id}/action/animationId`, `unknown_animation:${interaction.action.animationId}`, 'reference'));
  }
  for (const extension of document.extensionsRequired) {
    if (!document.extensionsUsed.includes(extension)) errors.push(issue('/extensionsRequired', `required_extension_not_declared_used:${extension}`, 'extension'));
  }
  return { valid: errors.length === 0, errors };
}

export function assertValidSceneDocument(value: unknown): asserts value is SceneDocument {
  const result = validateSceneDocument(value);
  if (!result.valid) {
    const detail = result.errors.map(error => `${error.path}: ${error.message}`).join('; ');
    throw new Error(`iamscene_document_invalid:${detail}`);
  }
}
