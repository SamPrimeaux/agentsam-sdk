import { createHash } from 'node:crypto';

export const comparePaths = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
export const digest = (type, value) => 'sha256:' + createHash('sha256')
  .update(`agentsam-merkle:${type}:v1\0`).update(value).digest('hex');
export const linkHash = (target) => digest('symlink', target);
export const directoryHash = (children) => digest('directory', JSON.stringify(
  [...children].sort((a, b) => comparePaths(a.name, b.name)).map(({ name, type, hash }) => [name, type, hash]),
));
export function fileHasher() {
  return createHash('sha256').update('agentsam-merkle:file:v1\0');
}
