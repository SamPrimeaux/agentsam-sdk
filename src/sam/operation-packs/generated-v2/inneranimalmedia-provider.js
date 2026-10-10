/**
 * Host adapter for existing /inneranimalmedia/backend/agentsam/tools/image_generation.js
 * The host explicitly injects the existing exported runImageGenerationForTool(env, name, params, ctx).
 * No duplicate OpenAI/Gemini/Workers AI client is created.
 */
export function createInnerAnimalMediaImageProvider({ env, runImageGenerationForTool, resolveImageReference } = {}) {
  if (typeof runImageGenerationForTool !== 'function') throw new Error('image_generation_provider_not_connected');
  return async (legacyToolName, input, identity) => {
    if (!identity?.actorId || !identity.accountId || !identity.installationId) throw new Error('trusted_identity_required');
    const params = { ...input };
    if (legacyToolName === 'imgx_edit_image') {
      if (typeof resolveImageReference !== 'function') throw new Error('authorized_source_image_resolver_required');
      const source = await resolveImageReference({ sourceArtifactRef: input.sourceArtifactRef, identity });
      if (!source?.url) throw new Error('source_image_not_authorized_or_missing');
      params.image_url = source.url;
      delete params.sourceArtifactRef;
    }
    return runImageGenerationForTool(env, legacyToolName, params, {
      authUser: { id: identity.actorId }, userId: identity.actorId,
      tenantId: identity.accountId, workspaceId: identity.workspaceId || null,
      conversationId: identity.conversationId || null,
    });
  };
}
