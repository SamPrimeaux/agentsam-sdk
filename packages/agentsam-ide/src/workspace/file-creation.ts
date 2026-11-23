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
  const parent = path.split('/').slice(0, -1).join('/');
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
