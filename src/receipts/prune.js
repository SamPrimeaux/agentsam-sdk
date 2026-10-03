import { readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function directorySize(root) {
  let total = 0;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) total += await directorySize(full);
    else if (entry.isFile()) total += (await stat(full)).size;
  }
  return total;
}

export async function pruneLocalWorkspaces({
  maxTmpGb = 1,
  tmpDir = os.tmpdir(),
  prefix = "agentsam-",
  dryRun = false,
  detailLimit = 100,
} = {}) {
  const maxBytes = Math.max(0, Number(maxTmpGb)) * 1024 * 1024 * 1024;
  const entries = await readdir(tmpDir, { withFileTypes: true });
  const targets = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    const fullPath = path.join(tmpDir, entry.name);
    const info = await stat(fullPath);
    const byteSize = await directorySize(fullPath);
    targets.push({ path: fullPath, mtime: info.mtimeMs, byteSize });
  }

  targets.sort((a, b) => a.mtime - b.mtime);
  let remainingBytes = targets.reduce((sum, target) => sum + target.byteSize, 0);
  const purged = [];

  for (const target of targets) {
    if (remainingBytes <= maxBytes) break;
    if (!dryRun) {
      await rm(target.path, { recursive: true, force: true });
    }
    remainingBytes -= target.byteSize;
    purged.push(target);
  }

  const boundedDetailLimit = Math.max(0, Math.min(1000, Number(detailLimit) || 0));
  const purgeDetails = purged
    .slice(0, boundedDetailLimit)
    .map((item) => Object.freeze({ ...item }));

  return Object.freeze({
    maxBytes,
    scannedCount: targets.length,
    purgedCount: purged.length,
    purgedBytes: purged.reduce((sum, item) => sum + item.byteSize, 0),
    remainingBytes: Math.max(0, remainingBytes),
    dryRun,
    purged: Object.freeze(purgeDetails),
    purgedDetailLimit: boundedDetailLimit,
    purgedDetailsTruncated: purged.length > purgeDetails.length,
  });
}
