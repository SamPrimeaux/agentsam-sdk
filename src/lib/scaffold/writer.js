/**
 * Writes a nested file-tree object to disk.
 *
 * fileTree shape:
 * {
 *   'src/index.js': '// content',
 *   'wrangler.toml': '...',
 *   'migrations/001_init.sql': '...',
 * }
 */

import fs from 'fs/promises';
import path from 'path';

export async function writeFileTree(baseDir, fileTree) {
  for (const [relativePath, content] of Object.entries(fileTree)) {
    const fullPath = path.join(baseDir, relativePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');
  }
}
