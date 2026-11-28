#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const repoRoot = resolve(appRoot, '../..');
const manifestPath = join(scriptDir, 'creative-template-storage-migration-20261127.json');
const reportPath = join(scriptDir, 'creative-template-storage-migration-report-20261127.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const execute = process.argv.includes('--execute');
const deleteSource = process.argv.includes('--delete-source');
if (deleteSource && !execute) throw new Error('--delete-source requires --execute');
if (manifest.schema !== 'inneranimal.creative-template-storage-migration.v1') throw new Error('Unsupported migration manifest');

const tempRoot = mkdtempSync(join(tmpdir(), 'iam-creative-template-migration-'));
const report = {
  schema: 'inneranimal.creative-template-storage-report.v1',
  sourceBucket: manifest.sourceBucket,
  targetBucket: manifest.targetBucket,
  mode: execute ? (deleteSource ? 'execute-and-delete-source' : 'execute-copy-verify') : 'dry-run',
  entries: [],
  deletedSourceKeys: [],
};

function runWrangler(args, allowMissing = false) {
  const result = spawnSync('wrangler', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status === 0) return { ok: true, stdout: result.stdout || '', stderr: result.stderr || '' };
  const output = (result.stdout || '') + '\n' + (result.stderr || '');
  if (allowMissing && /specified key does not exist|NoSuchKey|not found/i.test(output)) return { ok: false, missing: true, output };
  throw new Error('wrangler ' + args.join(' ') + ' failed:\n' + output);
}
function getObject(bucket, key, file) {
  return runWrangler(['r2', 'object', 'get', bucket + '/' + key, '--remote', '--file', file], true);
}
function putObject(bucket, key, file, contentType) {
  runWrangler(['r2', 'object', 'put', bucket + '/' + key, '--remote', '--file', file, '--content-type', contentType, '--force']);
}
function deleteObject(bucket, key) {
  const existsPath = join(tempRoot, 'delete-check-' + report.deletedSourceKeys.length);
  const exists = getObject(bucket, key, existsPath);
  if (exists.missing) return false;
  runWrangler(['r2', 'object', 'delete', bucket + '/' + key, '--remote', '--force']);
  return true;
}
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function safeName(value) {
  return String(value || 'object').replace(/[^a-zA-Z0-9_-]/g, '_');
}

try {
  console.log('Creative template storage migration: ' + manifest.entries.length + ' objects');
  console.log('Source: ' + manifest.sourceBucket + ' → Target: ' + manifest.targetBucket);
  console.log('Mode: ' + report.mode);
  for (let index = 0; index < manifest.entries.length; index++) {
    const entry = manifest.entries[index];
    const sourceFile = join(tempRoot, 'source-' + index + '-' + safeName(entry.templateId));
    const targetFile = join(tempRoot, 'target-' + index + '-' + safeName(entry.templateId));
    if (!execute) {
      console.log('PLAN ' + (entry.templateId || 'preview') + ' ' + (entry.sourceKey || entry.sourceFile) + ' → ' + entry.targetKey);
      continue;
    }

    if (entry.sourceFile) {
      copyFileSync(join(appRoot, entry.sourceFile), sourceFile);
    } else {
      const source = getObject(entry.sourceBucket, entry.sourceKey, sourceFile);
      if (source.missing) throw new Error('Required source object is missing: ' + entry.sourceBucket + '/' + entry.sourceKey);
    }
    const sourceHash = sha256(sourceFile);
    const bytes = statSync(sourceFile).size;
    if (entry.expectedSha256 && sourceHash !== entry.expectedSha256) {
      throw new Error('Source checksum mismatch for ' + entry.templateId + ': expected ' + entry.expectedSha256 + ', got ' + sourceHash);
    }

    const targetExists = getObject(entry.targetBucket, entry.targetKey, targetFile);
    let action = 'uploaded';
    if (targetExists.ok) {
      const targetHash = sha256(targetFile);
      if (targetHash !== sourceHash) throw new Error('Destination collision with different bytes: ' + entry.targetBucket + '/' + entry.targetKey);
      action = 'already-identical';
    } else {
      putObject(entry.targetBucket, entry.targetKey, sourceFile, entry.contentType);
      const verified = getObject(entry.targetBucket, entry.targetKey, targetFile);
      if (!verified.ok) throw new Error('Uploaded object could not be reopened: ' + entry.targetKey);
      const targetHash = sha256(targetFile);
      if (targetHash !== sourceHash) throw new Error('Destination checksum mismatch for ' + entry.targetKey);
    }
    report.entries.push({
      templateId: entry.templateId,
      resourceKind: entry.resourceKind,
      sourceBucket: entry.sourceBucket || null,
      sourceKey: entry.sourceKey || null,
      targetBucket: entry.targetBucket,
      targetKey: entry.targetKey,
      contentType: entry.contentType,
      bytes,
      sha256: sourceHash,
      action,
    });
    console.log('VERIFIED ' + entry.templateId + ' ' + bytes + ' bytes ' + sourceHash + ' ' + action);
  }

  if (execute) {
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log('Verification report: ' + reportPath);
  }

  if (deleteSource) {
    if (report.entries.length !== manifest.entries.length) throw new Error('Refusing source deletion before every destination object is verified');
    for (const entry of manifest.entries) {
      if (!entry.sourceKey || !entry.sourceBucket) continue;
      if (deleteObject(entry.sourceBucket, entry.sourceKey)) {
        report.deletedSourceKeys.push(entry.sourceBucket + '/' + entry.sourceKey);
      }
    }
    for (const orphan of manifest.orphanSourceKeys || []) {
      if (deleteObject(orphan.bucket, orphan.key)) report.deletedSourceKeys.push(orphan.bucket + '/' + orphan.key);
    }
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log('Deleted ' + report.deletedSourceKeys.length + ' old source objects after destination verification.');
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
