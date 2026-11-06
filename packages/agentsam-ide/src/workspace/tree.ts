import type { WorkspaceEntry } from './files.js';

/** Directory ancestry used by the SDK explorer and file palette. No host I/O or fixtures. */
export function workspaceParents(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
}

/** Build a complete, stable tree even if an authorized host only returns files. */
export function workspaceTree(entries: readonly WorkspaceEntry[]): WorkspaceEntry[] {
  const byPath = new Map<string, WorkspaceEntry>();
  for (const entry of entries) {
    for (const parent of workspaceParents(entry.path)) {
      if (!byPath.has(parent)) byPath.set(parent, { path: parent, kind: 'folder' });
    }
    byPath.set(entry.path, entry);
  }
  return Array.from(byPath.values()).sort((a, b) => {
    const aParts = a.path.split('/');
    const bParts = b.path.split('/');
    const common = Math.min(aParts.length, bParts.length);
    for (let index = 0; index < common; index += 1) {
      if (aParts[index] !== bParts[index]) {
        if (a.kind === 'folder' && b.kind === 'file' && index === common - 1) return -1;
        if (a.kind === 'file' && b.kind === 'folder' && index === common - 1) return 1;
        return aParts[index]!.localeCompare(bParts[index]!, undefined, { numeric: true });
      }
    }
    return aParts.length - bParts.length;
  });
}

/** A closed folder hides its descendants, without removing any real file from the workspace. */
export function visibleWorkspaceTree(entries: readonly WorkspaceEntry[], expanded: ReadonlySet<string>): WorkspaceEntry[] {
  return workspaceTree(entries).filter(entry =>
    workspaceParents(entry.path).every(parent => expanded.has(parent))
  );
}
