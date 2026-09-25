/**
 * Path containment for local machine filesystem authority.
 * Rejects NUL, traversal, and symlink escapes outside the approved root.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} root
 * @param {string} relativeOrAbs
 * @returns {{ ok: true, abs: string, rel: string } | { ok: false, error: string, code: string }}
 */
export function resolveContainedPath(root, relativeOrAbs) {
  if (typeof root !== 'string' || !root.trim()) {
    return { ok: false, error: 'workspace_root_required', code: 'invalid_root' };
  }
  if (typeof relativeOrAbs !== 'string') {
    return { ok: false, error: 'path_required', code: 'invalid_path' };
  }
  if (relativeOrAbs.includes('\0')) {
    return { ok: false, error: 'nul_in_path', code: 'invalid_path' };
  }

  let rootReal;
  try {
    rootReal = fs.realpathSync(path.resolve(root));
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: 'root_unresolvable',
    };
  }

  const joined = path.isAbsolute(relativeOrAbs)
    ? path.normalize(relativeOrAbs)
    : path.resolve(rootReal, relativeOrAbs);

  // Reject obvious escapes before realpath (missing parents still checked via prefix).
  const relToRoot = path.relative(rootReal, joined);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    return { ok: false, error: 'path_escape', code: 'path_escape' };
  }

  let absReal = joined;
  try {
    absReal = fs.realpathSync(joined);
  } catch (err) {
    // File may not exist yet (create/write) — ensure parent is inside root.
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      const parent = path.dirname(joined);
      let parentReal;
      try {
        parentReal = fs.realpathSync(parent);
      } catch (parentErr) {
        // Walk up until an existing ancestor within root.
        let cursor = parent;
        let found = null;
        while (cursor.startsWith(rootReal)) {
          if (fs.existsSync(cursor)) {
            try {
              found = fs.realpathSync(cursor);
              break;
            } catch {
              break;
            }
          }
          const next = path.dirname(cursor);
          if (next === cursor) break;
          cursor = next;
        }
        if (!found || (found !== rootReal && !found.startsWith(rootReal + path.sep))) {
          return {
            ok: false,
            error: parentErr instanceof Error ? parentErr.message : String(parentErr),
            code: 'path_escape',
          };
        }
        parentReal = found;
      }
      if (parentReal !== rootReal && !parentReal.startsWith(rootReal + path.sep)) {
        return { ok: false, error: 'path_escape', code: 'path_escape' };
      }
      absReal = joined;
    } else {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: 'path_unresolvable',
      };
    }
  }

  if (absReal !== rootReal && !absReal.startsWith(rootReal + path.sep)) {
    return { ok: false, error: 'symlink_escape', code: 'path_escape' };
  }

  const rel = absReal === rootReal ? '.' : path.relative(rootReal, absReal).split(path.sep).join('/');
  return { ok: true, abs: absReal, rel: rel || '.' };
}
