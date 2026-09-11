import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { comparePaths, fileHasher } from './hash.js';
import { FILEMETA_FORMAT, FILEMETA_VERSION, metadataRoot } from './filemeta.js';
const MAX_AST_BYTES = 2 * 1024 * 1024;

const LANGUAGE_BY_EXTENSION = Object.freeze({
  '.c': 'c', '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp', '.css': 'css', '.go': 'go',
  '.h': 'c', '.hpp': 'cpp', '.html': 'html', '.java': 'java', '.js': 'javascript',
  '.jsx': 'javascript', '.json': 'json', '.md': 'markdown', '.mjs': 'javascript',
  '.cjs': 'javascript', '.py': 'python', '.rs': 'rust', '.scss': 'scss', '.sql': 'sql',
  '.ts': 'typescript', '.tsx': 'typescript', '.yaml': 'yaml', '.yml': 'yaml',
});
const AST_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const ASSET_EXTENSIONS = new Set([
  '.avif', '.eot', '.gif', '.ico', '.jpeg', '.jpg', '.mp3', '.mp4', '.ogg', '.otf', '.pdf',
  '.png', '.svg', '.ttf', '.wav', '.webm', '.webp', '.woff', '.woff2',
]);
const CONFIG_NAMES = new Set([
  'package.json', 'tsconfig.json', 'wrangler.json', 'wrangler.jsonc', 'wrangler.toml',
  'vite.config.js', 'vite.config.mjs', 'vite.config.ts', 'eslint.config.js', '.gitignore',
]);

function systemName(value) {
  return String(value || '')
    .replace(/^@[^/]+\//, '')
    .replace(/^agentsam-sdk-/, '')
    .replace(/^agentsam-/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || null;
}

function extensionOf(relative) {
  const lower = relative.toLowerCase();
  if (lower.endsWith('.d.ts')) return '.ts';
  return path.posix.extname(lower);
}

function nearestPackage(relative, packages) {
  let best = null;
  for (const pkg of packages) {
    if (!pkg.root || relative === pkg.root || relative.startsWith(pkg.root + '/')) {
      if (!best || pkg.root.length > best.root.length) best = pkg;
    }
  }
  return best;
}

function inferLayer(relative, packageRoot) {
  const local = packageRoot && relative.startsWith(packageRoot + '/') ? relative.slice(packageRoot.length + 1) : relative;
  const parts = local.split('/');
  for (const name of ['frontend', 'backend', 'shared']) if (parts.includes(name)) return name;
  const src = parts.indexOf('src');
  if (src >= 0 && parts[src + 1] && parts[src + 1].includes('.') === false) return parts[src + 1];
  for (const name of ['test', 'tests', 'docs', 'scripts', 'protocol', 'templates', 'migrations']) if (parts[0] === name || parts.includes(name)) return name === 'tests' ? 'test' : name;
  return parts.length > 1 ? parts[0] : 'root';
}

function inferCategory(relative) {
  const filename = path.posix.basename(relative);
  const ext = path.posix.extname(filename);
  let stem = ext ? filename.slice(0, -ext.length) : filename;
  if (stem === 'index' || stem === 'README') stem = path.posix.basename(path.posix.dirname(relative));
  return stem.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'root';
}

function inferKind(relative, language) {
  const lower = relative.toLowerCase();
  const ext = extensionOf(relative);
  if (/(^|\/)(__tests__|tests?|fixtures?)(\/|$)/.test(lower) || /\.(test|spec)\.[^.]+$/.test(lower)) return 'test';
  if (ASSET_EXTENSIONS.has(ext)) return 'asset';
  if (ext === '.md' || /(^|\/)docs?(\/|$)/.test(lower) || path.posix.basename(relative).toLowerCase().startsWith('readme')) return 'documentation';
  if (ext === '.sql' || /(^|\/)migrations?(\/|$)/.test(lower)) return 'migration';
  if (CONFIG_NAMES.has(path.posix.basename(relative)) || /(^|\/)(config|configs)(\/|$)/.test(lower)) return 'config';
  if (language && !['json', 'yaml'].includes(language)) return 'source';
  if (language) return 'data';
  return 'file';
}

function inferRole(relative, layer, kind) {
  const lower = relative.toLowerCase();
  if (kind === 'test') return 'test';
  if (kind === 'documentation') return 'documentation';
  if (kind === 'migration') return 'database';
  if (kind === 'config') return 'configuration';
  if (/(^|\/)contracts?(\/|$)/.test(lower)) return 'contract';
  if (/(^|\/)adapters?(\/|$)/.test(lower)) return 'adapter';
  if (/(^|\/)providers?(\/|$)/.test(lower)) return 'provider';
  if (/(^|\/)(routes?|api|server)(\/|$)/.test(lower) || ['routes', 'api', 'server'].includes(layer)) return 'transport';
  if (layer === 'frontend') return 'ui';
  if (layer === 'core') return 'business-logic';
  if (layer === 'scripts') return 'tooling';
  return kind === 'source' ? 'runtime' : kind;
}

function globRegex(glob) {
  let source = '^';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') { source += '.*'; i++; }
      else source += '[^/]*';
    } else if (char === '?') source += '[^/]';
    else source += /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(source + '$');
}

function packageRule(localPath, pkg) {
  const rules = Array.isArray(pkg?.agentsam?.classify) ? pkg.agentsam.classify : [];
  const out = {};
  const tags = new Set();
  for (const rule of rules) {
    if (!rule || typeof rule.glob !== 'string' || !globRegex(rule.glob).test(localPath)) continue;
    for (const key of ['system', 'category', 'layer', 'kind', 'language', 'role']) if (typeof rule[key] === 'string' && rule[key]) out[key] = rule[key];
    if (Array.isArray(rule.tags)) for (const tag of rule.tags) if (typeof tag === 'string' && tag) tags.add(tag);
  }
  if (tags.size) out.tags = [...tags].sort();
  return out;
}

function scriptKind(ext) {
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.jsx') return ts.ScriptKind.JSX;
  if (ext === '.ts') return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function declarationNames(node) {
  const out = [];
  const addBinding = (name) => {
    if (!name) return;
    if (ts.isIdentifier(name)) out.push(name.text);
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) for (const element of name.elements) if (ts.isBindingElement(element)) addBinding(element.name);
  };
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) && node.name) out.push(node.name.text);
  else if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) addBinding(declaration.name);
  return out;
}

function astMetadata(relative, source) {
  const ext = extensionOf(relative);
  const file = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, scriptKind(ext));
  const symbols = new Set();
  const imports = new Set();
  for (const statement of file.statements) {
    for (const name of declarationNames(statement)) symbols.add(name);
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
      const value = statement.moduleSpecifier;
      if (value && ts.isStringLiteralLike(value)) imports.add(value.text);
    }
  }
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') imports.add(node.arguments[0].text);
      else if (node.expression.kind === ts.SyntaxKind.ImportKeyword) imports.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  const symbolList = [...symbols].sort();
  const importList = [...imports].sort();
  return {
    symbols: symbolList,
    imports: importList,
    ast: {
      indexed: true,
      parser: 'typescript',
      symbol_count: symbolList.length,
      dependency_count: importList.length,
      parse_error_count: Array.isArray(file.parseDiagnostics) ? file.parseDiagnostics.length : 0,
    },
  };
}

async function readVerifiedFile(rootPath, entry) {
  const filename = path.join(rootPath, ...entry.path.split('/'));
  const before = await fs.lstat(filename, { bigint: true });
  if (!before.isFile()) throw new Error(`Semantic index expected a file: ${entry.path}`);
  if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`File is too large: ${entry.path}`);
  const buffer = await fs.readFile(filename);
  const after = await fs.lstat(filename, { bigint: true });
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
    throw new Error(`File changed while building semantic metadata: ${entry.path}`);
  }
  const hash = fileHasher();
  hash.update(buffer);
  const verified = 'sha256:' + hash.digest('hex');
  if (verified !== entry.hash || buffer.length !== entry.size) throw new Error(`Merkle/semantic content mismatch: ${entry.path}`);
  return { buffer, mode: Number(after.mode & 0o7777n) };
}

async function readPackages(rootPath, tree) {
  const manifests = tree.entries.filter((entry) => entry.type === 'file' && path.posix.basename(entry.path) === 'package.json');
  const packages = [];
  for (const entry of manifests) {
    const { buffer } = await readVerifiedFile(rootPath, entry);
    let parsed = {};
    try { parsed = JSON.parse(buffer.toString('utf8')); } catch { parsed = {}; }
    const agentsam = parsed.agentsam && typeof parsed.agentsam === 'object' && !Array.isArray(parsed.agentsam) ? parsed.agentsam : {};
    packages.push({
      root: path.posix.dirname(entry.path) === '.' ? '' : path.posix.dirname(entry.path),
      name: typeof parsed.name === 'string' ? parsed.name : null,
      agentsam,
    });
  }
  return packages.sort((a, b) => comparePaths(a.root, b.root));
}

function summarize(entries, packages) {
  const bySystem = {};
  const byLanguage = {};
  let astIndexed = 0;
  for (const entry of entries) {
    if (entry.system) bySystem[entry.system] = (bySystem[entry.system] || 0) + 1;
    if (entry.language) byLanguage[entry.language] = (byLanguage[entry.language] || 0) + 1;
    if (entry.ast?.indexed) astIndexed++;
  }
  return {
    entries: entries.length,
    files: entries.filter((entry) => entry.type === 'file').length,
    symlinks: entries.filter((entry) => entry.type === 'symlink').length,
    packages: packages.length,
    ast_indexed: astIndexed,
    by_system: Object.fromEntries(Object.entries(bySystem).sort()),
    by_language: Object.fromEntries(Object.entries(byLanguage).sort()),
  };
}

export async function buildSemanticMetadata(rootPath, tree) {
  const packages = await readPackages(rootPath, tree);
  const classifier = {
    format: FILEMETA_FORMAT,
    version: FILEMETA_VERSION,
    source: 'path+package+ast',
    ast_parser: 'typescript',
    ast_parser_version: ts.version,
  };
  const entries = [];
  for (const contentEntry of tree.entries) {
    if (contentEntry.type === 'directory') continue;
    const pkg = nearestPackage(contentEntry.path, packages);
    const localPath = pkg?.root && contentEntry.path.startsWith(pkg.root + '/') ? contentEntry.path.slice(pkg.root.length + 1) : contentEntry.path;
    const ext = extensionOf(contentEntry.path);
    const language = LANGUAGE_BY_EXTENSION[ext] || null;
    const layer = inferLayer(contentEntry.path, pkg?.root || '');
    const kind = contentEntry.type === 'symlink' ? 'symlink' : inferKind(contentEntry.path, language);
    const structuralSystem = (contentEntry.path.startsWith('packages/') || contentEntry.path.startsWith('apps/')) ? contentEntry.path.split('/')[1] : null;
    const baseSystem = pkg?.agentsam?.system || pkg?.name || structuralSystem || contentEntry.path.split('/')[0];
    const explicit = packageRule(localPath, pkg);
    const tags = new Set([...(Array.isArray(pkg?.agentsam?.tags) ? pkg.agentsam.tags : []), ...(explicit.tags || [])].filter((tag) => typeof tag === 'string' && tag));
    let mode = contentEntry.mode;
    let sourceBuffer = null;
    if (contentEntry.type === 'file' && AST_EXTENSIONS.has(ext) && contentEntry.size <= MAX_AST_BYTES) {
      const verified = await readVerifiedFile(rootPath, contentEntry);
      if (mode != null && verified.mode !== mode) throw new Error(`File mode changed while building semantic metadata: ${contentEntry.path}`);
      mode = verified.mode;
      sourceBuffer = verified.buffer;
    }
    if (mode == null) {
      const filename = path.join(rootPath, ...contentEntry.path.split('/'));
      mode = Number((await fs.lstat(filename, { bigint: true })).mode & 0o7777n);
    }
    const record = {
      path: contentEntry.path,
      type: contentEntry.type,
      ...(contentEntry.type === 'file' ? { size: contentEntry.size } : {}),
      mode,
      hash: contentEntry.hash,
      ...(pkg?.name ? { package: pkg.name } : {}),
      ...(pkg ? { package_root: pkg.root || '.' } : {}),
      ...(pkg?.agentsam?.kind ? { package_kind: pkg.agentsam.kind } : {}),
      system: explicit.system || systemName(baseSystem),
      category: explicit.category || inferCategory(contentEntry.path),
      layer: explicit.layer || layer,
      kind: explicit.kind || kind,
      ...(explicit.language || language ? { language: explicit.language || language } : {}),
      role: explicit.role || inferRole(contentEntry.path, explicit.layer || layer, explicit.kind || kind),
      tags: [...tags].sort(),
    };
    if (sourceBuffer) Object.assign(record, astMetadata(contentEntry.path, sourceBuffer.toString('utf8')));
    entries.push(record);
  }
  entries.sort((a, b) => comparePaths(a.path, b.path));
  return {
    format: FILEMETA_FORMAT,
    version: FILEMETA_VERSION,
    algorithm: 'sha256',
    classifier,
    rootHash: metadataRoot(entries, classifier),
    stats: summarize(entries, packages),
    entries,
  };
}
