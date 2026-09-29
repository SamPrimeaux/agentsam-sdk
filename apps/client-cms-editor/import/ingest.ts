/**
 * Safe source intake — directory or .zip → quarantine tree + inventory + provenance.
 * Does not normalize into CMS structures (see normalize-html.ts).
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SKIP_DIR = new Set(['node_modules', '.git', 'dist', '.DS_Store', '__MACOSX']);
const MAX_FILES = 50_000;
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

export type IntakeFileRecord = {
  path: string;
  size: number;
  hash: string;
  category: 'html' | 'css' | 'js' | 'image' | 'font' | 'json' | 'other';
};

export type SourceIntake = {
  id: string;
  sourceKind: 'directory' | 'zip';
  sourcePath: string;
  sourceHash: string;
  quarantineDir: string;
  contentRoot: string;
  files: IntakeFileRecord[];
  ingestedAt: string;
};

function hashBuffer(buf: Buffer) {
  return createHash('sha256').update(buf).digest('hex');
}

function hashFile(abs: string) {
  return hashBuffer(readFileSync(abs));
}

function categorize(rel: string): IntakeFileRecord['category'] {
  const ext = extname(rel).toLowerCase();
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.css') return 'css';
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'js';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'].includes(ext)) return 'image';
  if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) return 'font';
  if (ext === '.json') return 'json';
  return 'other';
}

function walkFiles(dir: string, root = dir, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walkFiles(abs, root, out);
    else out.push(abs);
  }
  return out;
}

function inventory(contentRoot: string): IntakeFileRecord[] {
  const files: IntakeFileRecord[] = [];
  let totalBytes = 0;
  for (const abs of walkFiles(contentRoot)) {
    const st = statSync(abs);
    totalBytes += st.size;
    if (files.length >= MAX_FILES) throw new Error(`intake exceeds max file count (${MAX_FILES})`);
    if (totalBytes > MAX_BYTES) throw new Error(`intake exceeds max unpacked bytes (${MAX_BYTES})`);
    const rel = relative(contentRoot, abs).replace(/\\/g, '/');
    files.push({
      path: rel,
      size: st.size,
      hash: hashFile(abs),
      category: categorize(rel),
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function extractZip(zipPath: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  const result = spawnSync('unzip', ['-q', '-o', zipPath, '-d', dest], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `zip intake requires unzip CLI; failed for ${zipPath}: ${result.stderr || result.stdout || result.status}`,
    );
  }
}

function findContentRoot(quarantine: string): string {
  // Prefer a directory that contains HTML (site/, public/, or quarantine root).
  const candidates = [quarantine, join(quarantine, 'site'), join(quarantine, 'public')];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const html = walkFiles(candidate).some((f) => /\.html?$/i.test(f));
    if (html) return candidate;
  }
  // Zip may unwrap a single top-level folder
  const kids = readdirSync(quarantine).filter((n) => !SKIP_DIR.has(n));
  if (kids.length === 1) {
    const only = join(quarantine, kids[0]);
    if (statSync(only).isDirectory()) return findContentRoot(only);
  }
  return quarantine;
}

/**
 * Ingest a donor directory or .zip into a quarantine tree with hashed inventory.
 */
export function ingestSource(sourcePath: string, options?: { quarantineParent?: string }): SourceIntake {
  const abs = resolve(sourcePath);
  if (!existsSync(abs)) throw new Error(`ingest source not found: ${abs}`);

  const st = statSync(abs);
  const ingestedAt = new Date().toISOString();
  const id = `intake_${randomUUID().slice(0, 8)}`;
  const parent = options?.quarantineParent || mkdtempSync(join(tmpdir(), 'cms-intake-'));
  const quarantineDir = join(parent, id);
  mkdirSync(quarantineDir, { recursive: true });

  let sourceKind: 'directory' | 'zip';
  let sourceHash: string;

  if (st.isDirectory()) {
    sourceKind = 'directory';
    sourceHash = hashBuffer(Buffer.from(walkFiles(abs).map((f) => `${relative(abs, f)}:${hashFile(f)}`).join('\n')));
    cpSync(abs, quarantineDir, {
      recursive: true,
      filter: (src) => !src.split(/[/\\]/).some((p) => SKIP_DIR.has(p)),
    });
  } else if (st.isFile() && /\.zip$/i.test(abs)) {
    sourceKind = 'zip';
    sourceHash = hashFile(abs);
    extractZip(abs, quarantineDir);
  } else {
    throw new Error(`ingest supports directory or .zip only (got ${abs})`);
  }

  const contentRoot = findContentRoot(quarantineDir);
  const files = inventory(contentRoot);

  const receipt = {
    schema: 'agentsam.cms.intake.v1',
    id,
    sourceKind,
    sourcePath: abs,
    sourceHash,
    contentRoot: relative(quarantineDir, contentRoot) || '.',
    fileCount: files.length,
    ingestedAt,
  };
  writeFileSync(join(quarantineDir, 'INTAKE_RECEIPT.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(join(quarantineDir, 'INTAKE_INVENTORY.json'), `${JSON.stringify(files, null, 2)}\n`);

  return {
    id,
    sourceKind,
    sourcePath: abs,
    sourceHash,
    quarantineDir,
    contentRoot,
    files,
    ingestedAt,
  };
}

export function packageThemePackToFs(packRoot: string, pack: import('./theme-pack').ThemePack) {
  mkdirSync(packRoot, { recursive: true });
  mkdirSync(join(packRoot, 'assets'), { recursive: true });
  mkdirSync(join(packRoot, 'pages'), { recursive: true });
  writeFileSync(join(packRoot, 'manifest.json'), `${JSON.stringify(pack.manifest, null, 2)}\n`);
  writeFileSync(join(packRoot, 'tokens.json'), `${JSON.stringify(pack.starterPack.theme, null, 2)}\n`);
  writeFileSync(join(packRoot, 'starter-pack.json'), `${JSON.stringify(pack.starterPack, null, 2)}\n`);
  writeFileSync(
    join(packRoot, 'provenance.json'),
    `${JSON.stringify({ provenance: pack.manifest.provenance, donorCandidates: pack.donorCandidates, assets: pack.assets }, null, 2)}\n`,
  );
  for (const page of pack.starterPack.pages) {
    const slug = page.slug === '/' ? 'home' : page.slug.replace(/^\/+|\/+$/g, '').replace(/\//g, '__');
    writeFileSync(join(packRoot, 'pages', `${slug}.json`), `${JSON.stringify(page, null, 2)}\n`);
  }
  return {
    root: packRoot,
    manifestPath: join(packRoot, 'manifest.json'),
    tokensPath: join(packRoot, 'tokens.json'),
    starterPackPath: join(packRoot, 'starter-pack.json'),
    provenancePath: join(packRoot, 'provenance.json'),
    assetsDir: join(packRoot, 'assets'),
    pagesDir: join(packRoot, 'pages'),
  };
}

export function loadStarterPackFromThemePackFs(packRoot: string): import('../shared/cms/src/starter-pack').CmsStarterPack {
  const raw = readFileSync(join(resolve(packRoot), 'starter-pack.json'), 'utf8');
  return JSON.parse(raw);
}

/** Convenience: basename without forcing path tricks for zip naming. */
export function intakeLabel(sourcePath: string) {
  return basename(sourcePath).replace(/\.zip$/i, '') || 'imported-theme';
}
