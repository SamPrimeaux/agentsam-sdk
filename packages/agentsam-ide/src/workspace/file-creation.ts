import { assertWorkspaceFile, normalizeWorkspacePath, FileWorkspaceError, type FileWorkspace, type WorkspaceFile } from './files.js';

/**
 * Save an untitled buffer through the host's authorized filesystem adapter.
 * No guessed root, token, OAuth route or unchecked overwrite is permitted.
 */
export async function createWorkspaceTextFile(
  workspace: FileWorkspace,
  requestedPath: string,
  content: string,
): Promise<WorkspaceFile> {
  if (workspace.configuration?.readonly || workspace.configuration?.capabilities?.create === false) {
    throw new FileWorkspaceError('source_not_writable', 'Choose a writable file source before saving this draft.');
  }
  const path = normalizeWorkspacePath(requestedPath);
  const parts = path.split('/');
  // VS Code-style nested creation: "reports/new/file.py" also creates the
  // requested parent folders, using the same authorized adapter. Never pass
  // a slash-delimited name directly to FileSystemDirectoryHandle.getFileHandle.
  for (let i = 0; i < parts.length - 1; i++) {
    const parent = parts.slice(0, i).join('/');
    const folder = parts.slice(0, i + 1).join('/');
    const children = await workspace.list(parent || undefined);
    const existing = children.find(entry => entry.path === folder);
    if (existing?.kind === 'file') {
      throw new FileWorkspaceError('path_not_directory', 'A file occupies the requested parent folder path.');
    }
    if (!existing) await workspace.create(folder, 'folder');
  }
  const parent = parts.slice(0, -1).join('/');
  const siblings = await workspace.list(parent || undefined);
  if (siblings.some(entry => entry.path === path)) {
    throw new FileWorkspaceError('file_exists', 'A file already exists at this path. Choose another name or open the existing file.');
  }

  await workspace.create(path, 'file');
  // A newly created file still needs a verified provider version before its
  // first nonempty write. Never manufacture a version or bypass concurrency.
  const created = assertWorkspaceFile(await workspace.read(path));
  if (!content) return created;
  const result = await workspace.write(path, content, created.version, { overwrite: false });
  if (!result.ok) {
    throw new FileWorkspaceError(result.code, result.message);
  }
  return assertWorkspaceFile(result.file);
}
