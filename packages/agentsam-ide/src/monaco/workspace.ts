/** Document identity belongs to the workspace host, not a global Monaco model registry. */
export type WorkspaceDocumentIdentity = { workspaceId: string; path: string };

/** A stable Monaco file URI scoped to one selected project. Paths are not opened here. */
export function workspaceDocumentUri({ workspaceId, path }: WorkspaceDocumentIdentity): string {
  if (!workspaceId?.trim()) throw new Error('ide_workspace_id_required');
  if (!path?.trim() || path.includes('\0')) throw new Error('ide_document_path_required');
  const parts = path.replace(/\\/g, '/').split('/').filter(part => part && part !== '.');
  if (!parts.length || parts.some(part => part === '..')) throw new Error('ide_document_path_invalid');
  return `file:///__agentsam_workspaces__/${encodeURIComponent(workspaceId)}/${parts.map(encodeURIComponent).join('/')}`;
}

/**
 * A host calls this when a workspace closes; switching tabs deliberately keeps
 * models alive so Monaco preserves undo stacks and selection state.
 */
export function disposeWorkspaceModels(
  monaco: { editor: { getModels(): Array<{ uri: { toString(): string }; dispose(): void }> } },
  workspaceId: string,
): number {
  if (!workspaceId?.trim()) throw new Error('ide_workspace_id_required');
  const prefix = `file:///__agentsam_workspaces__/${encodeURIComponent(workspaceId)}/`;
  let count = 0;
  for (const model of monaco.editor.getModels()) {
    if (!model.uri.toString().startsWith(prefix)) continue;
    model.dispose();
    count++;
  }
  return count;
}
