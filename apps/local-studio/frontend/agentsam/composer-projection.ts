import { projectComposerCatalog, type ComposerCatalogEntry } from '@inneranimalmedia/agentsam-workbench/capabilities';

export type ComposerPlugin = ComposerCatalogEntry;

/** Pure projection: Node tests and desktop UI use the same installed capability mapping. */
export function projectComposerPlugins(rows: unknown): ComposerPlugin[] {
  return projectComposerCatalog({ plugins: Array.isArray(rows) ? rows : [] });
}
