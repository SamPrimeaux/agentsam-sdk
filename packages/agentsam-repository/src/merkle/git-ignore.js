import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/**
 * Resolve Git-ignored paths using Git itself so every Merkle-backed consumer can
 * build evidence from the same checkout policy. Non-Git directories simply
 * return an empty list and still receive the protocol's built-in excludes.
 */
export async function gitIgnoredPaths(root) {
  try {
    const result = await execute('git', ['status', '--porcelain=v1', '--ignored=matching'], {
      cwd: root,
      maxBuffer: 16 * 1024 * 1024,
    });
    return [...new Set(result.stdout.split('\n')
      .filter((line) => line.startsWith('!! '))
      .map((line) => line.slice(3).trim().replace(/\/$/, ''))
      .filter((value) => value && !value.includes('\\') && !value.split('/').includes('..')))];
  } catch {
    return [];
  }
}
