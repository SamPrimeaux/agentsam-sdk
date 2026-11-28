import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolve a package root through Node's package exports and dependency search. */
export function resolveNpmPackageRoot(packageName) {
  const entryUrl = import.meta.resolve(`${packageName}/skills`);
  const entryPath = fileURLToPath(entryUrl);
  return path.resolve(path.dirname(entryPath), '..');
}
