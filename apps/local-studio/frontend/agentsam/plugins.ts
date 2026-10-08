import { projectComposerCatalog, type ComposerCatalogEntry } from '@inneranimalmedia/agentsam-workbench/capabilities';
import { sideStageComposerWidgets } from './side-stage-actions.ts';

export type ComposerPlugin = ComposerCatalogEntry;

/** Read-only composition of the *same* authenticated Settings state and SideStage actions. */
export async function loadComposerCatalog(signal?: AbortSignal): Promise<ComposerCatalogEntry[]> {
  // This client uses the existing authenticated desktop bridge when packaged
  // in Tauri, and /api/connections for hosted Studio.
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const {listLocalStudioConnections}=await import("../src/lib/connections/client");
  const payload=await listLocalStudioConnections();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return projectComposerCatalog({
    plugins:payload.plugins || [],
    connections:payload.connections || [],
    widgets:sideStageComposerWidgets(),
  });
}
/** Kept as a compatibility alias for existing picker callers. */
export const loadComposerPlugins = loadComposerCatalog;

export function projectComposerPlugins(rows: unknown): ComposerPlugin[] {
  return projectComposerCatalog({plugins:Array.isArray(rows)?rows:[]});
}
