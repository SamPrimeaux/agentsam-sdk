/** Collapsible file tree model — dirs closed by default. */

export type FileTreeNode =
  | { type: 'dir'; name: string; path: string; children: FileTreeNode[] }
  | { type: 'file'; name: string; path: string; id?: string };

export type FileTreeState = {
  roots: FileTreeNode[];
  /** Expanded directory paths. Empty = all collapsed. */
  openDirs: Set<string>;
  selectedPath: string | null;
};

export function createFileTreeState(roots: FileTreeNode[] = []): FileTreeState {
  return { roots, openDirs: new Set(), selectedPath: null };
}

export function toggleDir(state: FileTreeState, path: string): FileTreeState {
  const openDirs = new Set(state.openDirs);
  if (openDirs.has(path)) openDirs.delete(path);
  else openDirs.add(path);
  return { ...state, openDirs };
}

export function collapseAll(state: FileTreeState): FileTreeState {
  return { ...state, openDirs: new Set() };
}

export function expandToPath(state: FileTreeState, filePath: string): FileTreeState {
  const openDirs = new Set(state.openDirs);
  const parts = filePath.split('/').filter(Boolean);
  let acc = '';
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i];
    openDirs.add(acc);
  }
  return { ...state, openDirs, selectedPath: filePath };
}

export function buildTreeFromPaths(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const dirs = new Map<string, FileTreeNode & { type: 'dir' }>();

  const ensureDir = (parts: string[]) => {
    let list = root;
    let path = '';
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      let node = dirs.get(path);
      if (!node) {
        node = { type: 'dir', name: part, path, children: [] };
        dirs.set(path, node);
        list.push(node);
      }
      list = node.children;
    }
    return list;
  };

  for (const filePath of [...paths].sort()) {
    const parts = filePath.split('/').filter(Boolean);
    const name = parts.pop() ?? filePath;
    const list = parts.length ? ensureDir(parts) : root;
    list.push({ type: 'file', name, path: filePath });
  }

  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) if (n.type === 'dir') sortNodes(n.children);
  };
  sortNodes(root);
  return root;
}
