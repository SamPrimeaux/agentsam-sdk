import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { fileHasher } from '../lib/merkle/hash.js';
import { fingerprint } from './config.js';

export const PARSER = `typescript:${ts.version}:agentsam-1`;
const EXTENSIONS = /\.(?:[cm]?[jt]sx?|md|mdx|sql|json)$/i;
const OMIT = /(^|\/)(?:\.git|\.agentsam|node_modules|dist|build|coverage|vendor|\.next|\.wrangler|\.venv|__pycache__)(\/|$)|(^|\/)(?:\.env[^/]*|\.dev\.vars[^/]*|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|[^/]*\.(?:min\.js|map))$/i;
const under = (file, scope) => scope === '.' || file === scope || file.startsWith(scope + '/');
export function inventory(root, scope) {
  let files;
  try { files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean); }
  catch {
    files = [];
    const walk = (dir = '') => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const file = dir ? `${dir}/${entry.name}` : entry.name;
        if (OMIT.test(file) || scope.exclude.some(s => under(file, s))) continue;
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile()) files.push(file);
      }
    };
    walk();
  }
  return [...new Set(files)].filter(file => EXTENSIONS.test(file) && !OMIT.test(file) && scope.include.some(s => under(file, s)) && !scope.exclude.some(s => under(file, s))).sort();
}
export function readSource(root, file) {
  // Refuse all symlink components, including tracked links into another repository.
  let current = root;
  for (const component of file.split('/')) {
    if (!component || component === '..' || component === '.') throw new Error(`Invalid source path: ${file}`);
    current = path.join(current, component);
    try { if (fs.lstatSync(current).isSymbolicLink()) return null; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  const fd = fs.openSync(current, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size > 2 * 1024 * 1024) return null;
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);
    const present = fs.statSync(current);
    if (before.ino !== present.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error(`Source changed during read: ${file}`);
    if (bytes.includes(0) || !Buffer.from(bytes.toString('utf8')).equals(bytes)) return null;
    return { content: bytes.toString('utf8'), hash: `sha256:${fileHasher().update(bytes).digest('hex')}`, bytes: bytes.length };
  } finally { fs.closeSync(fd); }
}

export function parseSource(file, content, maxChars = 4000) {
  const chunks = [], symbols = [], edges = [];
  const lineAt = offset => content.slice(0, offset).split('\n').length;
  const addChunk = (start, end, symbol = null) => {
    for (let pos = start; pos < end; pos += maxChars) {
      const stop = Math.min(end, pos + maxChars), text = content.slice(pos, stop);
      if (text.trim()) chunks.push({ content: text, content_hash: fingerprint(text), symbol, start_line: lineAt(pos), end_line: lineAt(stop), start: pos, end: stop });
    }
  };
  if (!/\.[cm]?[jt]sx?$/i.test(file)) { addChunk(0, content.length); return { chunks, symbols, edges, parser: 'text:1' }; }
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) {
    const d = source.parseDiagnostics[0];
    throw new Error(`${file}:${lineAt(d.start || 0)}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  }
  const visit = (node, parent = null) => {
    let owner = parent;
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isMethodDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isVariableDeclaration(node)) {
      const name = node.name?.getText(source) || 'default';
      owner = parent ? `${parent}.${name}` : name;
      symbols.push({ name: owner, kind: ts.SyntaxKind[node.kind], start_line: lineAt(node.getStart(source)), end_line: lineAt(node.end) });
    }
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) edges.push({ kind: ts.isImportDeclaration(node) ? 'imports' : 're_exports', target: node.moduleSpecifier.text, source: parent, resolved: false });
    if (ts.isCallExpression(node)) edges.push({ kind: 'calls', target: node.expression.getText(source), source: parent, resolved: false });
    ts.forEachChild(node, child => visit(child, owner));
  };
  visit(source);
  // Non-overlapping top-level statements keep unchanged functions reusable.
  let start = 0;
  for (const statement of source.statements) {
    const name = statement.name?.getText(source) || (ts.isVariableStatement(statement) ? statement.declarationList.declarations[0]?.name.getText(source) : null);
    addChunk(start, statement.end, name); start = statement.end;
  }
  addChunk(start, content.length);
  return { chunks, symbols, edges, parser: PARSER };
}
