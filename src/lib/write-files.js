import fs from 'fs';
import path from 'path';

/**
 * Write Agent Sam scaffold files to the user's machine (their repo, not IAM's).
 * @param {string} targetDir
 * @param {{ path: string, content: string }[]} files
 */
export function writeScaffoldFiles(targetDir, files) {
  const root = path.resolve(targetDir);
  if (fs.existsSync(root)) {
    throw new Error(`Directory already exists: ${root}`);
  }
  fs.mkdirSync(root, { recursive: true });
  for (const file of files) {
    const dest = path.join(root, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content, 'utf8');
  }
  return root;
}
